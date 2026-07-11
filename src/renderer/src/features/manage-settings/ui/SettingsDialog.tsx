import { useEffect, useState } from "react";
import { Button } from "@/src/shared/ui/button";
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

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [fredKey, setFredKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void window.electronAPI?.settings.getGeminiKey().then((key) => {
      if (!cancelled) setGeminiKey(key ?? "");
    });
    void window.electronAPI?.settings.getFredKey().then((key) => {
      if (!cancelled) setFredKey(key ?? "");
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        window.electronAPI?.settings.setGeminiKey(geminiKey.trim()),
        window.electronAPI?.settings.setFredKey(fredKey.trim()),
      ]);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage local credentials used by built-in pipelines.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="gemini-api-key">Gemini API Key</Label>
          <Input
            id="gemini-api-key"
            type="password"
            autoComplete="off"
            placeholder="AIza…"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            This key powers the local Daily News pipeline.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fred-api-key">FRED API Key</Label>
          <Input
            id="fred-api-key"
            type="password"
            autoComplete="off"
            placeholder="32-character lowercase key"
            value={fredKey}
            onChange={(e) => setFredKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Powers the Macro Indicators and Economic Calendar widgets. Free
            key: fredaccount.stlouisfed.org/apikey
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
