import { redirect } from "next/navigation";

type ChatRedirectProps = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ChatRedirectPage({ searchParams }: ChatRedirectProps) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, item));
    } else if (value) {
      params.set(key, value);
    }
  }
  if (!params.has("query")) params.set("workspace", "chat");
  redirect(`/${params.toString() ? `?${params.toString()}` : ""}`);
}
