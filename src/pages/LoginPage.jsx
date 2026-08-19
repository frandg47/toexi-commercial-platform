import LoginForm from "@/components/login-form";
import ThemeToggle from "@/components/theme-toggle";

export default function LoginPage() {
  return (
    <div
      className="
        relative min-h-svh flex flex-col items-center justify-center p-6 md:p-10
        bg-gray-100 dark:bg-background
      "
    >
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm md:max-w-3xl">
        <LoginForm />
      </div>
    </div>
  );
}
