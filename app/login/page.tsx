import { LoginScreen } from "@/components/login-screen";

export default async function LoginPage(props: { searchParams: Promise<{ next?: string }> }) {
  const searchParams = await props.searchParams;
  return <LoginScreen nextPath={searchParams.next || "/"} />;
}
