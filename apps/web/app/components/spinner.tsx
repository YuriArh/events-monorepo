import * as stylex from "@stylexjs/stylex";
import { Loader2Icon } from "lucide-react";

const spin = stylex.keyframes({
    from: { transform: "rotate(0deg)" },
    to: { transform: "rotate(360deg)" },
});

const styles = stylex.create({
    spinner: {
        animationName: spin,
        animationDuration: "1s",
        animationIterationCount: "infinite",
        animationTimingFunction: "linear",
    },
});

export function Spinner({ size }: { size?: number }) {
    return <Loader2Icon size={size} {...stylex.props(styles.spinner)} />;
}
