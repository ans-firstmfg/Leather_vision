export class CameraController {
  private stream?: MediaStream;
  private generation = 0;
  private events?: AbortController;

  constructor(private video: HTMLVideoElement, private media: Pick<MediaDevices, "getUserMedia">,
    private onEnded: () => void = () => {}) {}

  async start(facingMode: "user" | "environment" = "user") {
    this.stop();
    const generation = this.generation;
    const stream = await this.media.getUserMedia({ audio: false, video: {
      facingMode: { ideal: facingMode }, width: { ideal: 640 }, height: { ideal: 480 },
    } });
    if (generation !== this.generation) {
      stream.getTracks().forEach(track => track.stop());
      throw new DOMException("Camera request cancelled", "AbortError");
    }
    this.stream = stream;
    this.events = new AbortController();
    for (const track of stream.getTracks()) {
      track.addEventListener?.("ended", () => {
        if (generation !== this.generation) return;
        this.stop(); this.onEnded();
      }, { signal: this.events.signal, once: true });
    }
    this.video.srcObject = stream;
    try { await this.video.play(); }
    catch (error) { if (generation === this.generation) this.stop(); throw error; }
    if (generation !== this.generation) throw new DOMException("Camera request cancelled", "AbortError");
    return stream;
  }

  stop() {
    this.generation++;
    this.events?.abort(); this.events = undefined;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = undefined;
    this.video.pause();
    this.video.srcObject = null;
  }
}
