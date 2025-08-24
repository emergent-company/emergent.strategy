import "choices.js/public/assets/styles/choices.min.css";
import React, { useEffect, useRef } from "react";

export const SearchableDemo = () => {
    const selectRef = useRef<HTMLSelectElement>(null);

    useEffect(() => {
        const select = selectRef.current;
        if (!select) return;
        import("choices.js").then(({ default: Choices }) => {
            new Choices(select, { searchEnabled: true, noChoicesText: "Hello" });
        });
    }, []);

    return (
        <select multiple ref={selectRef}>
            <option value="">Select an option</option>
            <option value="apple">Apple</option>
            <option value="banana">Banana</option>
            <option disabled value="orange">
                Orange
            </option>
            <option value="carrot">Carrot</option>
            <option value="broccoli">Broccoli</option>
            <option value="spinach">Spinach</option>
        </select>
    );
};
