import Quill from "quill";
import "quill/dist/quill.bubble.css";
import React, { useEffect, useRef } from "react";

export const BubbleDemo = () => {
    const editorRef = useRef<HTMLDivElement>(null);
    const quillInstance = useRef<Quill>(null);

    useEffect(() => {
        import("quill").then(({ default: Quill }) => {
            if (!editorRef.current || quillInstance.current != null) return;

            quillInstance.current = new Quill(editorRef.current, {
                theme: "bubble",
                placeholder: "Write something cool...",
                modules: {
                    toolbar: [
                        [{ header: [1, 2, 3, false] }],
                        ["bold", "italic", "underline", "strike"],
                        [{ list: "ordered" }, { list: "bullet" }],
                        ["link", "image"],
                        ["clean"],
                    ],
                },
            });

            quillInstance.current.setContents([
                {
                    insert: "🚀 Welcome to Nexus Dashboard\n",
                    attributes: { header: 1 },
                },
                {
                    insert: "Your command center to manage users, track activity, and build smarter workflows.\n\n",
                },
                {
                    insert: "✨ What’s Included\n",
                    attributes: { header: 2 },
                },
                {
                    insert: "✅ ",
                },
                {
                    insert: "Solo License: ",
                    attributes: { bold: true },
                },
                {
                    insert: "Great for freelancers and personal projects.\n",
                },
                {
                    insert: "👥 ",
                },
                {
                    insert: "Team License: ",
                    attributes: { bold: true },
                },
                {
                    insert: "Ideal for startups and small teams.\n",
                },
                {
                    insert: "🏢 ",
                },
                {
                    insert: "Enterprise License: ",
                    attributes: { bold: true },
                },
                {
                    insert: "Full features, premium support, and advanced tools.\n\n",
                },
                {
                    insert: "🧰 Tech Stack\n",
                    attributes: { header: 2 },
                },
                {
                    insert: "Comes in: ",
                },
                {
                    insert: "HTML, React, Next.js, SvelteKit, Nuxt\n\n",
                    attributes: { bold: true },
                },
                {
                    insert: "💡 Why Nexus?\n",
                    attributes: { header: 2 },
                },
                {
                    insert: "Built with Tailwind and DaisyUI — clean design, smooth UX, and powerful components.\n\n",
                },
                {
                    insert: "✏️ Tip: ",
                    attributes: { italic: true },
                },
                {
                    insert: "You can edit this content directly or replace it with your own HTML-rich text.\n",
                },
            ]);
        });
    }, []);

    return <div ref={editorRef} />;
};
