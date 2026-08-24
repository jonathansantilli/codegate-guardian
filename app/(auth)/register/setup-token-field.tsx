import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasAnyUser } from "@/lib/db/queries";

/**
 * Asks for the token that claims an unclaimed instance.
 *
 * Renders nothing once the console has an operator: the token no longer opens
 * anything, and showing a dead field invites guessing at it.
 */
export async function SetupTokenField() {
  if (await hasAnyUser()) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <Label className="font-normal text-muted-foreground" htmlFor="setupToken">
        Setup token
      </Label>
      <Input
        className="h-10 rounded-lg border-border/50 bg-muted/50 text-sm transition-colors focus:border-foreground/20 focus:bg-muted"
        id="setupToken"
        name="setupToken"
        placeholder="From SETUP_TOKEN in your .env"
        required
        type="password"
      />
      <p className="text-muted-foreground text-xs leading-relaxed">
        This console has no operator yet. The token proves you are the person
        who deployed it, so the first account cannot be claimed by whoever
        reaches the port first.
      </p>
    </div>
  );
}
