type AiActionHandler = (param: any) => Promise<any>;

class AiActionManager {
  private _actionMap: Map<string, AiActionHandler> = new Map();

  registerAction(action: string, handler: AiActionHandler) {
    this._actionMap.set(action, handler);
  }

  async takeAction(action: string, param: any) {
    const handler = this._actionMap.get(action);
    if (handler) {
      return await handler(param);
    }
  }
}

const aiActionManager = new AiActionManager();
export default aiActionManager;
