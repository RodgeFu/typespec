import { inspect } from "util";
import vscode, { Diagnostic, ExtensionContext } from "vscode";
import aiActionManager from "./ai-action-manager.js";
import logger from "./log/logger.js";
import { joinPaths, normalizePath } from "./path-utils.js";
import { CommandName } from "./types.js";
import {
  isFile,
  isWhitespaceStringOrUndefined,
  newGuid,
  tryParseJson,
  tryReadFile,
  tryWriteFile,
} from "./utils.js";
import { Emitter, EmitterKind } from "./vscode-cmd/emit-code/emitter.js";

type aiAction =
  | aiSuggestAction
  | aiCodeUpdateAction
  | aiCodeEmitAction
  | aiImportOpenapiAction
  | aiUpdateTspconfigAction
  | aiPreviewOpenapiAction
  | aiCompileWatchAction
  | aiQuestionAction
  | aiSummaryAction
  | aiCreateProjectAction
  | aiCommentAction;

interface aiActionBase {
  type:
    | "suggest"
    | "update-code"
    | "create-project"
    | "emit-target-code"
    | "import-openapi"
    | "update-tspconfig"
    | "preview-openapi"
    | "compile-watch"
    | "question"
    | "summary"
    | "comment";
  description?: string;
}

interface aiSuggestAction extends aiActionBase {
  type: "suggest";
  message: string;
}

interface aiCodeUpdateAction extends aiActionBase {
  type: "update-code";
  file: string;
  newCode: string;
}

interface aiCodeEmitAction extends aiActionBase {
  type: "emit-target-code";
  package: string;
  suggestionForTarget: string;
}

interface aiImportOpenapiAction extends aiActionBase {
  type: "import-openapi";
}

interface aiUpdateTspconfigAction extends aiActionBase {
  type: "update-tspconfig";
  file: string;
  start: number;
  end: number;
  newCode: string;
}

interface aiPreviewOpenapiAction extends aiActionBase {
  type: "preview-openapi";
}

interface aiCompileWatchAction extends aiActionBase {
  type: "compile-watch";
}

interface aiQuestionAction extends aiActionBase {
  type: "question";
  message: string;
}

interface aiSummaryAction extends aiActionBase {
  type: "summary";
  message: string;
}

interface aiCreateProjectAction extends aiActionBase {
  type: "create-project";
}

interface aiCommentAction extends aiActionBase {
  type: "comment";
  file: string;
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
  message: string;
}

const BASE_PROMPT =
  `You are a helpful code assistant for typespec language. Your job is to help user to use typespec language. Include: \n` +
  `  - provide suggestion on typespec language syntax, convension and best practices \n` +
  `  - provide suggestion on update typespec language code (DO NOT provide suggestion if there is no code change) \n` +
  `  - provide suggestion on emitting code and instructions on how to use the emitted code \n` +
  `  - provide suggestion on importing from openapi \n` +
  `  - provide suggestion on updating tspconfig.yaml \n` +
  `  - provide suggestion on preview as openapi \n` +
  `  - provide suggestion on compile watch on file save \n` +
  `The known emitter packages are as below. Make your suggestion from them unless user provide one explicitly: \n` +
  `  - "OpenAPI 3.1 document": "@typespec/openapi3" ` +
  `  - "C# client": "@typespec/http-client-csharp" ` +
  `  - "Java client": "@typespec/http-client-java" ` +
  `  - "JavaScript client": "@typespec/http-client-js" ` +
  `  - "Python client": "@typespec/http-client-python" ` +
  `  - "C# server stubs": "@typespec/http-server-csharp" ` +
  `  - "JavaScript server stubs": "@typespec/http-server-js" ` +
  `If needed, you can reply to ask user questions for more information in following format. Make sure it's the only thing you respond if you have questions \n` +
  `{ "type": "question", "message": "one or multiple questions here as needed" } \n` +
  `if you get enough information to take action, response with step by step guidance with each step wrapped as single JSON object with following format. Make sure to give an overall summary of the actions you are going to take as the first summary step. Make sure the JSON object schema is correct. It is not necessary to wrap your response in triple backticks. \n` +
  `{ "type": "summary", "message": "your summary here" } \n` +
  `{ "type": "suggest", "message": "your suggestion here" } \n` +
  `{ "type": "create-project", "description": "Describe the project you are creating"} \n` +
  `{ "type": "update-code", "description": "Describe the code update you are making. Assume the user is new to the language.", "file": "{absolute path of target file, give a reasonable file name according to existing files if new file should be created}", "newCode": "new code in the file. Make sure to include all the code, not just the updated code. It is not necessary to wrap your response in triple backticks." } \n` +
  `{ "type": "emit-target-code", "description": "Describe the package you choose with reference to the used package", "package": "the name of the package to use. If you are not sure, ask user whether to confirm which emitter package to use"}, "suggestionForTarget": "i.e. the instructions on how to prepare environment for emitted language like Java, Python, Dotnet and so on. MAKE SURE this is for the emitted language, not the typespec" \n` +
  `{ "type": "import-openapi" ,"description": "you description about this step"} \n` +
  `{ "type": "code-config", "description": "you description about this step", "file": "{target file, NEW_FILE if suggest to create a new file}", "start-pos": {start position of target file to replace code}, "end-pos": {end position of target file to replace code}, "replace-code": "new code to replace code in target file" } \n` +
  `{ "type": "preview-openapi", "description": "you description about this step" } \n` +
  `{ "type": "compile-watch", "description": "you description about this step" } \n` +
  `If the user asks a question not related to typespec, politely decline to respond and let user know you are only able to response question about typespec.`;

const REVIEW_PROMPT =
  `You are a code tutor who helps students learn how to write better TypeSpec code. Your job is to evaluate the given code and then annotate any code that could be improved with a brief suggestion and the reason why you are making that suggestion. Only make suggestions when you feel the severity is enough that it will impact the readability and maintainability of the code. Be friendly with your suggestions and remember that these are students so they need gentle guidance. ` +
  //`You are a helpful code reviewer for typespec language. Your job is to review given code of typespec language and provide code review comments and potential fix suggestions. \n` +
  `Make sure to have one summary item first and one or multiple comment items wrapped as single JSON object with following format. It is not necessary to wrap your response in triple backticks. Here is an example of what your response should look like: \n` +
  `{ "type": "summary", "message": "your summary here" } \n` +
  `{ "type": "comment", "file": "{absolute path of the target file}", ` +
  `"startLine": {zero-based start line number of the code for the comment}, ` +
  `"startChar": {zero-based start character number of the start line of the code for the comment}, ` +
  `"endLine":{zero-based end line number of the code for the comment}, ` +
  `"endChar": {zero-based end character number of the end line of the code for the comment}, ` +
  `"message": "{detail comment message}"}` +
  `If needed, you can reply to ask user questions for more information in following format. Make sure it's the only thing you respond if you have questions \n` +
  `{ "type": "question", "message": "one or multiple questions here as needed" } \n` +
  `If the user asks a question not related to typespec code review, politely decline to respond and let user know you are only able to response question about typespec.`;

export function createAiAssistantHandler(
  ecContext: ExtensionContext,
  aiDiagnostics: vscode.DiagnosticCollection,
) {
  const aiAssistantHandler: vscode.ChatRequestHandler = async (
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
  ) => {
    let basicPrompt = BASE_PROMPT;
    let userPrompt = request.prompt;
    let includeError = false;
    let includeHistory = true;
    if (request.command === "hello") {
      stream.markdown("Hello friend! I am your Typespec AI Assistant. How can I help you today?");
      return;
    } else if (request.command === "fix") {
      includeHistory = false;
      if (isWhitespaceStringOrUndefined(request.prompt)) {
        userPrompt = `Fix the errors in the workspace`;
      } else {
        userPrompt = `Fix the errors in the workspace. Additional request from user: ${request.prompt}.`;
      }
    } else if (request.command === "review") {
      includeHistory = false;
      basicPrompt = REVIEW_PROMPT;
      includeError = true;
      aiDiagnostics.clear();
      // add additional code review guidance
      if (isWhitespaceStringOrUndefined(request.prompt)) {
        userPrompt = `Please review the given code and provide code review comments and potential fix suggestions. \n`;
      } else {
        userPrompt = `Please review the given code and provide code review comments and potential fix suggestions. Additional request from user "${request.prompt}"\n`;
      }
    }

    // compose all the messages
    const messages = [vscode.LanguageModelChatMessage.User(basicPrompt)];
    await pushTspKnowledge(messages);
    // send all code and config just for POC
    // TODO: need optimize to save token. investigation needed, i.e. ask AI what more context is needed first?
    await pushAllTspCode(messages);
    await pushTspConfig(messages);
    if (includeError) {
      await pushAllErrors(messages);
    }
    if (includeHistory) {
      await pushAllHistory(messages, context);
    }
    messages.push(vscode.LanguageModelChatMessage.User(userPrompt));

    // send the request
    const chatResponse = await request.model.sendRequest(messages, {}, token);

    let allResponse = "";
    let curStepJson = "";
    const finalMessages: string[] = [];
    const bracketTracker = [];
    // stream the response
    for await (const fragment of chatResponse.text) {
      for (const ch of fragment) {
        allResponse += ch;
        if (ch === "{") {
          bracketTracker.push("{");
        }
        if (bracketTracker.length > 0) {
          curStepJson += ch;
        }
        if (ch === "}") {
          bracketTracker.pop();
          if (bracketTracker.length === 0) {
            const json = tryParseJson(curStepJson);
            curStepJson = "";
            if (json) {
              await takeAction(stream, json, finalMessages);
            }
          }
        }
      }
    }
    if (finalMessages.length > 0) {
      finalMessages.forEach((msg) => {
        stream.markdown("  \n" + msg);
      });
    }
    logger.info(`AI response:\n${allResponse}`);
    return;
  };

  return aiAssistantHandler;

  async function takeAction(
    stream: vscode.ChatResponseStream,
    action: aiAction,
    finalMessages: string[],
  ) {
    switch (action.type) {
      case "summary":
        stream.markdown(action.message.trimEnd() + "  \n");
        logger.info(`Summary: ${action.message}`);
        break;
      case "suggest":
        stream.markdown(action.message.trimEnd() + "  \n");
        logger.info(`Suggestion: ${action.message}`);
        break;
      case "comment":
        const uri = vscode.Uri.file(action.file);
        const diags = [...(aiDiagnostics.get(uri) ?? [])];
        const range = new vscode.Range(
          action.startLine,
          action.startChar,
          action.endLine,
          action.endChar,
        );
        const one = new Diagnostic(range, action.message, vscode.DiagnosticSeverity.Information);
        one.source = "TypeSpec-AI";
        diags.push(one);
        stream.markdown(`- Comment for `);
        stream.anchor(new vscode.Location(uri, range));
        stream.markdown(`  \n${action.message}  \n`);
        aiDiagnostics.set(uri, diags);
        const fMsg = "You can also review these comments in the 'Problems' panel.";
        if (!finalMessages.includes(fMsg)) {
          finalMessages.push(fMsg);
        }
        logger.info(`Comment: ${action.message}`);
        break;
      case "update-code":
        const targetFilePath = normalizePath(action.file);
        const isUpdate = await isFile(targetFilePath);
        const oldDiffFile: vscode.Uri = isUpdate
          ? vscode.Uri.file(targetFilePath)
          : vscode.Uri.from({
              scheme: mergeContentProvider.SCHEMA,
              path: joinPaths(targetFilePath, "old.tsp"),
            });
        const newDiffFile: vscode.Uri = vscode.Uri.from({
          scheme: mergeContentProvider.SCHEMA,
          path: joinPaths(targetFilePath, "new.tsp"),
        });
        if (oldDiffFile.scheme === mergeContentProvider.SCHEMA) {
          mergeContentProvider.registerContentByUri(oldDiffFile, "");
        }
        mergeContentProvider.registerContentByUri(newDiffFile, action.newCode);
        let preText: string = "";
        preText =
          "### **Attempt to " +
          (isUpdate ? "update" : "add new") +
          " file**: ```" +
          action.file +
          "```  \n" +
          "Description: " +
          action.description +
          "  \n";
        const actionId = newGuid();
        aiActionManager.registerAction(actionId, async () => {
          // this may not work if the AI doesn't use the given schema (newCode is not used)
          // so some handling is needed, but for now, good enough for poc
          await tryWriteFile(targetFilePath, action.newCode);
          if (oldDiffFile.scheme === mergeContentProvider.SCHEMA) {
            mergeContentProvider.registerContentByUri(oldDiffFile, action.newCode);
          }
        });

        const reviewArgs = encodeURIComponent(
          JSON.stringify([oldDiffFile, newDiffFile, `${targetFilePath} - AI Suggested Change`]),
        );
        const accArgs = encodeURIComponent(JSON.stringify([actionId]));

        // Use command URIs with arguments to link to commands from Markdown
        const markdownCommandString: vscode.MarkdownString = new vscode.MarkdownString(
          `${preText}Please [Review](command:vscode.diff?${reviewArgs}) the code change and [Accept](command:${CommandName.TakeAiAction}?${accArgs}) if it looks good.  \n`,
        );
        markdownCommandString.isTrusted = {
          enabledCommands: ["vscode.diff", CommandName.TakeAiAction],
        };

        stream.markdown(markdownCommandString);
        logger.info(`Update code: ${action.file}`);
        break;
      case "emit-target-code":
        stream.markdown(`Suggest to emit code with package: ${action.package}`);
        const emitter: Emitter = {
          kind: EmitterKind.Unknown,
          language: "language",
          package: action.package,
        };
        const mainFiles = (
          await vscode.workspace.findFiles("**/main.tsp", "**/node_modules/**")
        ).map((f) => f.fsPath);
        const mainFile = mainFiles.length > 0 ? mainFiles[0] : "";
        // TODO: handle the case where there is no main.tsp file
        // TODO: the change to emit-code seems breaking the original scenario, need to check
        stream.button({
          command: CommandName.EmitCode,
          arguments: [mainFile, [emitter]],
          title: "Emit Code",
        });
        if (action.suggestionForTarget) {
          stream.markdown(`Next step suggestion: ${action.suggestionForTarget}`);
        }
        logger.info(`Emit code: ${action.package}`);
        break;
      case "create-project":
        stream.markdown(`Create project: ${action.description}`);
        stream.button({
          command: CommandName.CreateProject,
          arguments: [],
          title: "Create Project",
        });
        logger.info(`Create project: ${action.description}`);
        break;
      case "import-openapi":
        logger.info(`Import openapi`);
        break;
      case "update-tspconfig":
        logger.info(`Update tspconfig: ${action.file}`);
        break;
      case "preview-openapi":
        logger.info(`Preview openapi`);
        break;
      case "compile-watch":
        logger.info(`Compile watch`);
        break;
      case "question":
        stream.markdown(action.message);
        logger.info(`Question: ${action.message}`);
        break;
      default:
        logger.info(`Unknown action type: ${inspect(action)}`);
    }
  }

  async function pushAllHistory(
    messages: vscode.LanguageModelChatMessage[],
    context: vscode.ChatContext,
  ) {
    // get all the previous participant messages
    const previousMessages = context.history; //.filter((h) => h instanceof vscode.ChatResponseTurn);
    // add the previous messages to the messages array
    previousMessages.forEach((m) => {
      let fullMessage = "";
      if (m instanceof vscode.ChatResponseTurn) {
        m.response.forEach((r) => {
          const mdPart = r as vscode.ChatResponseMarkdownPart;
          fullMessage += mdPart.value.value;
        });
        messages.push(vscode.LanguageModelChatMessage.Assistant(fullMessage));
      } else if (m instanceof vscode.ChatRequestTurn) {
        messages.push(vscode.LanguageModelChatMessage.User(m.prompt));
      }
    });
  }

  async function pushTspConfig(messages: vscode.LanguageModelChatMessage[]) {
    const configFile = await vscode.workspace.findFiles("**/tspconfig.yaml", "**/node_modules/**");
    if (configFile.length > 0) {
      // using [0] just for poc
      const configContent = await tryReadFile(configFile[0].fsPath);
      if (configContent) {
        messages.push(
          vscode.LanguageModelChatMessage.Assistant(
            `Following is the tspconfig.yaml file in the workspace: \n\n` + `${configContent}`,
          ),
        );
      }
    }
  }

  async function pushTspKnowledge(messages: vscode.LanguageModelChatMessage[]) {
    // initialize the messages array with the prompt
    const tsBasic = await tryReadFile(ecContext.asAbsolutePath("ai/typespec-basic.md"));
    const defineResourceDoc = await tryReadFile(
      ecContext.asAbsolutePath("ai/azure/step02.defineResource.md"),
    );
    const customActionDoc = await tryReadFile(
      ecContext.asAbsolutePath("ai/azure/step04.customAction.md"),
    );
    const fullExampleDoc = await tryReadFile(
      ecContext.asAbsolutePath("ai/azure/step05.fullexample.md"),
    );
    const msg = `Following is the basic syntax and style guidance for Typespec:\n ------------------- \n ${tsBasic} \n ------------------- \n`;
    // const msg2 = `Following is the basic guidance for writing typespec code for Azure Service:\n ------------------- \n ${asBasic} \n ------------------- \n`;
    messages.push(vscode.LanguageModelChatMessage.Assistant(msg));
    // messages.push(vscode.LanguageModelChatMessage.Assistant(msg2));
    const hintMsg = `Following is the basic guidance for defining resources in Azure Service:\n ------------------- \n ${defineResourceDoc} \n ------------------- \n`;
    const actionMsg = `Following is the basic guidance for defining custom actions in Azure Service:\n ------------------- \n ${customActionDoc} \n ------------------- \n`;
    const exampleMsg = `Following is the basic guidance for defining full example in Azure Service:\n ------------------- \n ${fullExampleDoc} \n ------------------- \n`;
    messages.push(vscode.LanguageModelChatMessage.Assistant(hintMsg));
    messages.push(vscode.LanguageModelChatMessage.Assistant(actionMsg));
    messages.push(vscode.LanguageModelChatMessage.Assistant(exampleMsg));
  }

  async function pushAllErrors(messages: vscode.LanguageModelChatMessage[]) {
    const errors: string[] = [];
    const allDiags = await vscode.languages.getDiagnostics();
    allDiags.forEach(([uri, diags]) => {
      diags.forEach((diag) => {
        if (diag.source === "TypeSpec") {
          errors.push(
            `\n----------\n ${uri.path}(${diag.range.start.line},${diag.range.start.character}): ${diag.message}\n----------\n`,
          );
        }
      });
    });
    if (errors.length > 0) {
      messages.push(
        vscode.LanguageModelChatMessage.Assistant(
          `Following are the errors found in the workspace:\n${errors.join("\n")}`,
        ),
      );
    } else {
      messages.push(vscode.LanguageModelChatMessage.Assistant(`No errors found in the workspace.`));
    }
    return errors.length > 0;
  }

  async function pushAllTspCode(messages: vscode.LanguageModelChatMessage[]) {
    // just list all the tsp files for POC
    const files = await vscode.workspace.findFiles("**/*.tsp", "**/node_modules/**");

    const codes: string[] = [];
    for (const file of files) {
      const fileContent = await tryReadFile(file.fsPath);
      if (fileContent) {
        const content = fileContent.split("\n").map((v, i) => `${i}: ${v}`);
        const addStartEnd =
          `// START OF FILE: ${file.fsPath} \n ` +
          `${content.join("\n")}\n` +
          `// END OF FILE: ${file.fsPath} `;
        codes.push(addStartEnd);
      }
    }

    const allCode = codes.join("\n");
    if (files.length > 0) {
      messages.push(
        vscode.LanguageModelChatMessage.Assistant(
          `Following is the typespec code in existing project. Make sure to update in existing project instead of a create a new project: \n\n` +
            allCode,
        ),
      );
    } else {
      messages.push(
        vscode.LanguageModelChatMessage.Assistant(
          `There is no typespec code found in the workspace now.`,
        ),
      );
    }
  }
}

// temp solution for supporting the diff view. we should integrate
// into Edit/Agent mode when possible.
class MergeContentProvider implements vscode.TextDocumentContentProvider {
  readonly SCHEMA = "ai-merge";
  private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
  private _contentMap: Map<string, string> = new Map();

  get onDidChange(): vscode.Event<vscode.Uri> {
    return this._onDidChange.event;
  }

  registerContentByUri(uri: vscode.Uri, content: string) {
    this._contentMap.set(uri.toString(), content);
    this._onDidChange.fire(uri);
  }

  registerContent(uri: string, content: string) {
    const fullUri = vscode.Uri.from({
      scheme: this.SCHEMA,
      path: uri,
    });
    this._contentMap.set(fullUri.toString(), content);
    this._onDidChange.fire(fullUri);
  }

  unregisterContent(uri: string) {
    const fullUri = vscode.Uri.from({
      scheme: this.SCHEMA,
      path: uri,
    });
    this._contentMap.delete(fullUri.toString());
    this._onDidChange.fire(fullUri);
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    if (uri.scheme !== this.SCHEMA) {
      return "";
    }
    const content = this._contentMap.get(uri.toString());
    return content ?? "";
  }
}

export const mergeContentProvider = new MergeContentProvider();
