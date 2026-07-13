import { AuthForm } from "@/components/auth/auth-form";

export const metadata = {
  title: "注册 · English Reader",
};

export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <AuthForm mode="register" />
    </main>
  );
}
