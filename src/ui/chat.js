/**
 * Chat window — HTML overlay for AI character dialogue.
 * Opens with a character reference; forwards messages to DialogueSession.
 */
export class ChatWindow {
  constructor() {
    this.visible = false;
    this._session = null;
  }

  open(character, session) {
    // TODO: build and show chat DOM overlay, bind to session
    this._session = session;
    this.visible = true;
    console.log(`[chat] opened with ${character.name}`);
  }

  close() {
    // TODO: animate and remove chat overlay
    this._session = null;
    this.visible = false;
  }

  async send(message) {
    if (!this._session) return;
    // TODO: display user message, await AI response, display it
    const reply = await this._session.send(message);
    return reply;
  }
}
