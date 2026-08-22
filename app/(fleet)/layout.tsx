import { Toaster } from "sonner";
import "./fleet.css";

// The fleet console has its own shell and its own stylesheet; the chat
// sidebar has no place here.
export default function FleetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Toaster position="top-center" theme="system" />
      {children}
    </>
  );
}
