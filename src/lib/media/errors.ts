export class MediaPermissionError extends Error {
  constructor(message = "You do not have permission to manage this media.") {
    super(message);
    this.name = "MediaPermissionError";
  }
}
