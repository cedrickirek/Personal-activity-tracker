import { redirect } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { configProblem } from "@/lib/config";
import { SetupProblem } from "../setup-problem";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const problem = configProblem();
  if (problem) return <SetupProblem message={problem} />;
  if (await isLoggedIn()) redirect("/");
  return (
    <main className="mx-auto w-full max-w-sm flex-1 space-y-4 px-4 py-16">
      <h1 className="text-xl font-semibold">Activity tracker</h1>
      <LoginForm />
    </main>
  );
}
