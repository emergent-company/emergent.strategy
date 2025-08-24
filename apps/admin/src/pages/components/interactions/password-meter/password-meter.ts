export class PasswordMeter {
    private readonly input: HTMLInputElement | null;
    private rules = [
        (v: string) => v.length >= 8,
        (v: string) => /[a-z]/.test(v),
        (v: string) => /[A-Z]/.test(v),
        (v: string) => /\d/.test(v),
        (v: string) => /\W/.test(v),
    ];

    constructor(target: string | HTMLInputElement) {
        this.input = typeof target === "string" ? document.querySelector<HTMLInputElement>(target) : target;

        this.input?.addEventListener("input", this.update);
    }

    private update = () => {
        if (!this.input) return;

        const val = this.input.value;
        let passed = 0;

        this.rules.forEach((rule, i) => {
            const attr = `data-pass-r${i + 1}`;
            if (rule(val)) {
                this.input!.setAttribute(attr, "");
                passed++;
            } else {
                this.input!.removeAttribute(attr);
            }
        });

        for (let i = 1; i <= this.rules.length; i++) {
            const attr = `data-pass-p${i * 20}`;
            if (i <= passed) {
                this.input.setAttribute(attr, "");
            } else {
                this.input.removeAttribute(attr);
            }
        }
    };

    destroy() {
        if (!this.input) return;
        this.input.removeEventListener("input", this.update);
        for (let i = 1; i <= this.rules.length; i++) {
            this.input.removeAttribute(`data-pass-r${i}`);
            this.input.removeAttribute(`data-pass-p${i * 20}`);
        }
    }
}
