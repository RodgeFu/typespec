import vscode, { LogOutputChannel } from "vscode";

export function createExtensionLogger(outputChannel: LogOutputChannel) {
  return {
    info,
    warning,
    error,
    debug,
  };

  function logInternal(
    logAction: () => void,
    popupAction: () => void,
    showOutput: boolean,
    showPopup: boolean
  ) {
    if (outputChannel) {
      logAction();
      if (showOutput) {
        outputChannel.show(true /*preserveFocus*/);
      }
    }
    if (showPopup) {
      popupAction();
    }
  }

  function info(message: string, showOutput: boolean = false, showPopup: boolean = false) {
    logInternal(
      () => outputChannel?.info(message),
      () => {
        void vscode.window.showInformationMessage(message);
      },
      showOutput,
      showPopup
    );
  }

  function warning(message: string, showOutput: boolean = false, showPopup: boolean = false) {
    logInternal(
      () => outputChannel?.warn(message),
      () => {
        void vscode.window.showWarningMessage(message);
      },
      showOutput,
      showPopup
    );
  }

  function error(message: string, showOutput: boolean = false, showPopup: boolean = false) {
    logInternal(
      () => outputChannel?.error(message),
      () => {
        void vscode.window.showErrorMessage(message);
      },
      showOutput,
      showPopup
    );
  }

  function debug(message: string, showOutput: boolean = false, showPopup: boolean = false) {
    logInternal(
      () => outputChannel?.debug(message),
      () => {},
      showOutput,
      showPopup
    );
  }
}
