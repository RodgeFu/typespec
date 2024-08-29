import vscode, { LogOutputChannel } from "vscode";

type Progress = vscode.Progress<{
  message?: string;
  increment?: number;
}>;

export class ExtensionLogger{
  constructor(public outputChannel?: LogOutputChannel) {}

  private logInternal(
    logAction: () => void,
    popupAction: () => void,
    progressAction: () => void,
    showOutput: boolean,
    showPopup: boolean,
  ) {
    if (this.outputChannel) {
      logAction();
      if (showOutput) {
        this.outputChannel.show(true /*preserveFocus*/);
      }
    }
    if (showPopup) {
      popupAction();
    }
    progressAction();
  }

  info(message: string, showOutput: boolean = false, showPopup: boolean = false, progress?: Progress) {
    this.logInternal(
      () => this.outputChannel?.info(message),
      () => {
        void vscode.window.showInformationMessage(message, "View details in Output").then((value) => {
          this.outputChannel?.show();
        });
      },
      () => progress?.report({ message }),
      showOutput,
      showPopup
    );
  }

  warning(message: string, showOutput: boolean = false, showPopup: boolean = false, progress?: Progress) {
    this.logInternal(
      () => this.outputChannel?.warn(message),
      () => {
        void vscode.window.showWarningMessage(message, "View details in Output").then((value) => {
          this.outputChannel?.show();
        });
      },
      () => progress?.report({ message }),
      showOutput,
      showPopup
    );
  }

  error(message: string, showOutput: boolean = false, showPopup: boolean = false, progress?: Progress) {
    this.logInternal(
      () => this.outputChannel?.error(message),
      () => {
        void vscode.window.showErrorMessage(message, "View details in Output").then((value) => {
          this.outputChannel?.show();
        });
      },
      () => progress?.report({ message }),
      showOutput,
      showPopup
    );
  }

  debug(message: string, showOutput: boolean = false, showPopup: boolean = false, progress?: Progress) {
    this.logInternal(
      () => this.outputChannel?.debug(message),
      () => {},
      () => progress?.report({ message }),
      showOutput,
      showPopup
    );
  }
}

const logger = new ExtensionLogger();
export default logger;
