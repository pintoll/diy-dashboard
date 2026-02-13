import { useState } from "react";
import { Settings, Webhook } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/shared/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/src/shared/ui/dialog";
import { Input } from "@/src/shared/ui/input";
import { Label } from "@/src/shared/ui/label";

type DailyNewsSettingsProps = {
  webhookUrl: string;
  onSave: (webhookUrl: string) => void;
};

export function DailyNewsSettings({ webhookUrl, onSave }: DailyNewsSettingsProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draft, setDraft] = useState(webhookUrl);

  function handleOpenDialog() {
    setDraft(webhookUrl);
    setDialogOpen(true);
  }

  function handleSave() {
    onSave(draft.trim());
    setDialogOpen(false);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs">
            <Settings className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleOpenDialog}>
            <Webhook className="size-4" />
            Configure Webhook URL
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Webhook URL</DialogTitle>
            <DialogDescription>
              Enter the URL of your n8n webhook that returns the news digest.
              Leave empty to use mock data.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="webhook-url">URL</Label>
            <Input
              id="webhook-url"
              placeholder="https://n8n.example.com/webhook/..."
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
