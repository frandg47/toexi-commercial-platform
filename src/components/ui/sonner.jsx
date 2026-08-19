import { Toaster as Sonner } from "sonner";
import { useTheme } from "next-themes";

const Toaster = ({ ...props }) => {
  const { resolvedTheme = "light" } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme}
      className="toaster group"
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--popover-foreground)",
        "--normal-border": "var(--border)"
      }}
      {...props}
    />
  );
};

export { Toaster };
