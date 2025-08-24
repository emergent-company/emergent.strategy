export class InputSpinner {
    private readonly input: HTMLInputElement;
    private buttons: NodeListOf<HTMLElement>;
    private holdInterval: number | null = null;
    private holdTimeout: number | null = null;
    private listeners: Array<{ el: Element; type: string; fn: EventListener }> = [];

    constructor(input: string | HTMLInputElement) {
        this.input = typeof input === "string" ? document.querySelector<HTMLInputElement>(input)! : input;

        if (!this.input || !this.input.id) throw new Error("Input element with valid id required");

        this.buttons = document.querySelectorAll(`[data-spinner-control="${this.input.id}"]`);
        this.init();
        this.validateButtons();
    }

    private addListener(el: Element, type: string, fn: EventListener) {
        el.addEventListener(type, fn);
        this.listeners.push({ el, type, fn });
    }

    private init() {
        this.buttons.forEach((btn) => {
            this.addListener(btn, "mousedown", () => this.startHold(btn));
            this.addListener(btn, "touchstart", () => this.startHold(btn));
            this.addListener(btn, "mouseup", () => this.stopHold());
            this.addListener(btn, "mouseleave", () => this.stopHold());
            this.addListener(btn, "touchend", () => this.stopHold());
            this.addListener(btn, "click", () => {
                this.handleSpin(btn);
                this.validateButtons();
            });
        });

        this.addListener(this.input, "input", () => this.validateButtons());
    }

    private startHold(btn: HTMLElement) {
        this.stopHold();
        this.holdTimeout = window.setTimeout(() => {
            this.holdInterval = window.setInterval(() => {
                this.handleSpin(btn);
                this.validateButtons();
            }, 100);
        }, 400);
    }

    private stopHold() {
        if (this.holdTimeout) {
            clearTimeout(this.holdTimeout);
            this.holdTimeout = null;
        }
        if (this.holdInterval) {
            clearInterval(this.holdInterval);
            this.holdInterval = null;
        }
    }

    private handleSpin(btn: HTMLElement) {
        if (btn.hasAttribute("disabled")) return;

        const rawStep = btn.getAttribute("data-steps") ?? "1";
        const step = parseFloat(rawStep);
        const min = this.input.hasAttribute("min") ? parseFloat(this.input.min) : -Infinity;
        const max = this.input.hasAttribute("max") ? parseFloat(this.input.max) : Infinity;
        const current = parseFloat(this.input.value) || 0;

        let next = current + step;
        next = Math.max(min, Math.min(max, next));
        const decimals = this.getMaxDecimals(current, step);

        this.input.value = next.toFixed(decimals);
        this.input.dispatchEvent(new Event("change"));
    }

    private validateButtons() {
        const min = this.input.hasAttribute("min") ? parseFloat(this.input.min) : -Infinity;
        const max = this.input.hasAttribute("max") ? parseFloat(this.input.max) : Infinity;
        const current = parseFloat(this.input.value) || 0;

        this.buttons.forEach((btn) => {
            const step = parseFloat(btn.getAttribute("data-steps") ?? "1");
            const disabled = (step < 0 && current <= min) || (step > 0 && current >= max);
            btn.toggleAttribute("disabled", disabled);
            btn.classList.toggle("disabled", disabled);
        });
    }

    private getMaxDecimals(a: number, b: number): number {
        const aDec = (a.toString().split(".")[1] || "").length;
        const bDec = (b.toString().split(".")[1] || "").length;
        return Math.max(aDec, bDec);
    }

    public destroy() {
        this.stopHold();
        this.listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
        this.listeners = [];
    }
}
