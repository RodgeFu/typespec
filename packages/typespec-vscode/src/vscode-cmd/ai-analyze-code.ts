import vscode, { ExtensionContext, window } from "vscode";
import logger from "../log/logger.js";
import { normalizePath } from "../path-utils.js";
import { OperationTelemetryEvent } from "../telemetry/telemetry-event.js";
import { TspLanguageClient } from "../tsp-language-client.js";
import { tryExecuteWithUi } from "../ui-utils.js";
import { tryReadFile } from "../utils.js";

// form vscode tutorial with small modification
// just try the sample out. should integrate into ai assistant if we do want this
export async function aiAnalyzeCode(
  context: ExtensionContext,
  client: TspLanguageClient,
  tel: OperationTelemetryEvent,
) {
  await tryExecuteWithUi(
    {
      name: "AI Analyze Code",
      progress: {
        title: "Analyzing code with AI",
        withCancelAndTimeout: false,
        timeoutInMs: 0,
      },
    },
    async () => {
      if (window.activeTextEditor?.document.fileName.endsWith(".tsp")) {
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

        const [m] = await vscode.lm.selectChatModels({
          vendor: "copilot",
          family: "gpt-4o",
        });

        const ANNOTATION_PROMPT =
          `You are a code analyzer who helps user to write better typespec code. ` +
          `Your job is to evaluate typespec code in given files and then annotate any lines that could be improved with a brief suggestion ` +
          `and the reason why you are making that suggestion. ` +
          `Only make suggestions when you feel the severity is enough that it will impact the ` +
          `readability and maintainability of the code. Be friendly with your suggestions and remember that these are user so they need gentle guidance. ` +
          `Format each suggestion as a single JSON object. It is not necessary to wrap your response in triple backticks. ` +
          `Here is an example of what your response should look like:` +
          `\n` +
          `{ "file": "c:/proj/main.tsp, "line": 1, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }` +
          `{ "file": "c:/proj/common.tsp", "line": 12, "suggestion": "I think you should use a for loop instead of a while loop. A for loop is more concise and easier to read." }` +
          `{ "file": "c:/proj/util.tsp", "line": 6, "suggestion": "I think you should define service metadata, versioning, and authentication clearly}` +
          `{ "file": "c:/proj/serviceA.tsp", "line": 8, "suggestion": "I think you can move this model to common.tsp so that it can be reused}` +
          `{ "file": "c:/proj/helper.tsp", "line": 0, "suggestion": "I think createOrUpdate should be used"}`;
        const tsBasic = await tryReadFile(context.asAbsolutePath("ai/typespec-basic.md"));
        // const asBasic = await tryReadFile(context.asAbsolutePath("ai/azure-service.guideline.md"));
        const basicMsg = `Following is the basic syntax and style guidance for Typespec:\n ------------------- \n ${tsBasic} \n ------------------- \n`;
        // const msg2 = `Following is the basic guidance for writing typespec code for Azure Service:\n ------------------- \n ${asBasic} \n ------------------- \n`;

        const resHint = await tryReadFile(
          context.asAbsolutePath("ai/azure/step02.defineResource.md"),
        );
        const hintMsg = `Following is the basic guidance for defining resources in Azure Service:\n ------------------- \n ${resHint} \n ------------------- \n`;

        const actionHint = await tryReadFile(
          context.asAbsolutePath("ai/azure/step04.customAction.md"),
        );
        const actionMsg = `Following is the basic guidance for defining custom actions in Azure Service:\n ------------------- \n ${actionHint} \n ------------------- \n`;

        const exampleHint = await tryReadFile(
          context.asAbsolutePath("ai/azure/step05.fullexample.md"),
        );
        const exampleMsg = `Following is the basic guidance for defining full example in Azure Service:\n ------------------- \n ${exampleHint} \n ------------------- \n`;

        // Seems just giving url isn't that useful
        // const hint =
        //   `You can refer to following urls for language basics for typespec: \n ` +
        //   `  - https://typespec.io/docs/language-basics/overview/` +
        //   `  - https://typespec.io/docs/language-basics/built-in-types/` +
        //   `  - https://typespec.io/docs/language-basics/identifiers/` +
        //   `  - https://typespec.io/docs/language-basics/imports/` +
        //   `  - https://typespec.io/docs/language-basics/namespaces/` +
        //   `  - https://typespec.io/docs/language-basics/decorators/` +
        //   `  - https://typespec.io/docs/language-basics/directives/` +
        //   `  - https://typespec.io/docs/language-basics/documentation/` +
        //   `  - https://typespec.io/docs/language-basics/scalars/` +
        //   `  - https://typespec.io/docs/language-basics/models/` +
        //   `  - https://typespec.io/docs/language-basics/operations/` +
        //   `  - https://typespec.io/docs/language-basics/interfaces/` +
        //   `  - https://typespec.io/docs/language-basics/templates/` +
        //   `  - https://typespec.io/docs/language-basics/enums/` +
        //   `  - https://typespec.io/docs/language-basics/unions/` +
        //   `  - https://typespec.io/docs/language-basics/intersections/` +
        //   `  - https://typespec.io/docs/language-basics/type-literals/` +
        //   `  - https://typespec.io/docs/language-basics/alias/` +
        //   `  - https://typespec.io/docs/language-basics/values/` +
        //   `  - https://typespec.io/docs/language-basics/type-relations/` +
        //   `  - https://typespec.io/docs/language-basics/visibility/` +
        //   `You can refer to following urls for style guidance for typespec: \n ` +
        //   `  - https://typespec.io/docs/handbook/style-guide/`;

        const messages = [
          vscode.LanguageModelChatMessage.User(ANNOTATION_PROMPT),
          vscode.LanguageModelChatMessage.Assistant(basicMsg),
          vscode.LanguageModelChatMessage.Assistant(hintMsg),
          vscode.LanguageModelChatMessage.Assistant(actionMsg),
          vscode.LanguageModelChatMessage.Assistant(exampleMsg),
          // feels not a good idea to give all the code,
          // maybe we should just give the current one, need to try it out
          vscode.LanguageModelChatMessage.User(allCode),
        ];

        // make sure the model is available
        if (m) {
          // send the messages array to the model and get the response
          const chatResponse = await m.sendRequest(
            messages,
            {},
            new vscode.CancellationTokenSource().token,
          );

          // handle chat response
          await parseChatResponse(chatResponse, window.activeTextEditor);
        }
      }
    },
  );
}

async function parseChatResponse(
  chatResponse: vscode.LanguageModelChatResponse,
  textEditor: vscode.TextEditor,
) {
  let allResponse = "";
  let accumulatedResponse = "";

  for await (const fragment of chatResponse.text) {
    allResponse = "";
    accumulatedResponse += fragment;

    // Better parser needed here
    // if the fragment is a }, we can try to parse the whole line
    if (fragment.includes("}")) {
      try {
        const annotation = JSON.parse(accumulatedResponse);
        if (normalizePath(textEditor.document.fileName) === normalizePath(annotation.file)) {
          applyDecoration(textEditor, annotation.line, annotation.suggestion);
        }
        // reset the accumulator for the next line
        accumulatedResponse = "";
      } catch (e) {
        // do nothing
      }
    }
  }
  logger.info("AI response:\n" + allResponse);
}

function applyDecoration(editor: vscode.TextEditor, line: number, suggestion: string) {
  const decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      contentText: ` ${suggestion.substring(0, 25) + "..."}`,
      color: "grey",
    },
  });
  if (line === 0) line = 1;

  // get the end of the line with the specified line number
  const lineLength = editor.document.lineAt(Math.max(line - 1, 0)).text.length;
  const range = new vscode.Range(
    new vscode.Position(line - 1, lineLength),
    new vscode.Position(line - 1, lineLength),
  );

  const decoration = { range: range, hoverMessage: suggestion };

  vscode.window.activeTextEditor?.setDecorations(decorationType, [decoration]);
}
