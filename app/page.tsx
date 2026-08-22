import { redirect } from "next/navigation";

// Guardian is the product; the console is the front door.
export default function Page() {
  redirect("/fleet");
}
