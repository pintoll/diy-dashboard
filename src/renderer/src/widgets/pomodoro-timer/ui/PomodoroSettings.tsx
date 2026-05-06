import { useState } from "react";
import { Settings2, X } from "lucide-react";
import { Button } from "@/src/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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
import { Switch } from "@/src/shared/ui/switch";
import type { PomodoroPresetId, PomodoroConfig } from "../model/pomodoro.types";
import { POMODORO_PRESETS } from "../model/pomodoro.types";
import {
  isNotificationSupported,
  requestNotificationPermission,
} from "../model/notifications";

type PomodoroSettingsProps = {
  activePresetId: PomodoroPresetId;
  config: PomodoroConfig;
  onPresetChange: (presetId: PomodoroPresetId, config: PomodoroConfig) => void;
  notificationsEnabled: boolean;
  onNotificationsChange: (enabled: boolean) => void;
  leisureProcesses: string[];
  onAddLeisureProcess: (exeName: string) => void;
  onRemoveLeisureProcess: (exeName: string) => void;
};

export function PomodoroSettings({
  activePresetId,
  config,
  onPresetChange,
  notificationsEnabled,
  onNotificationsChange,
  leisureProcesses,
  onAddLeisureProcess,
  onRemoveLeisureProcess,
}: PomodoroSettingsProps) {
  const [customDialogOpen, setCustomDialogOpen] = useState(false);
  const [workMinutes, setWorkMinutes] = useState(config.workDuration);
  const [breakMinutes, setBreakMinutes] = useState(config.shortBreakDuration);
  const [leisureDialogOpen, setLeisureDialogOpen] = useState(false);
  const [leisureInput, setLeisureInput] = useState("");

  async function handleNotificationToggle(checked: boolean) {
    if (checked) {
      const granted = await requestNotificationPermission();
      onNotificationsChange(granted);
    } else {
      onNotificationsChange(false);
    }
  }

  function handlePresetSelect(value: string) {
    if (value === "custom") {
      setWorkMinutes(config.workDuration);
      setBreakMinutes(config.shortBreakDuration);
      setCustomDialogOpen(true);
      return;
    }

    const preset = POMODORO_PRESETS.find((p) => p.id === value);
    if (preset) {
      onPresetChange(preset.id, {
        workDuration: preset.workDuration,
        shortBreakDuration: preset.shortBreakDuration,
        longBreakDuration: preset.longBreakDuration,
        pomodorosUntilLongBreak: config.pomodorosUntilLongBreak,
        leisureProcesses: config.leisureProcesses,
      });
    }
  }

  function handleCustomApply() {
    const work = Math.max(1, Math.min(240, Math.round(workMinutes)));
    const brk = Math.max(1, Math.min(60, Math.round(breakMinutes)));

    onPresetChange("custom", {
      workDuration: work,
      shortBreakDuration: brk,
      longBreakDuration: brk * 3,
      pomodorosUntilLongBreak: config.pomodorosUntilLongBreak,
      leisureProcesses: config.leisureProcesses,
    });
    setCustomDialogOpen(false);
  }

  function handleAddLeisure() {
    const trimmed = leisureInput.trim();
    if (trimmed === "") return;
    onAddLeisureProcess(trimmed);
    setLeisureInput("");
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs">
            <Settings2 />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuRadioGroup
            value={activePresetId}
            onValueChange={handlePresetSelect}
          >
            {POMODORO_PRESETS.map((preset) => (
              <DropdownMenuRadioItem key={preset.id} value={preset.id}>
                {preset.label}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuRadioItem value="custom">
              Custom…
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setLeisureDialogOpen(true)}>
            Leisure processes…
          </DropdownMenuItem>
          {isNotificationSupported() && (
            <>
              <DropdownMenuSeparator />
              <div className="flex items-center justify-between px-2 py-1.5">
                <Label htmlFor="notifications-toggle" className="text-sm font-normal cursor-pointer">
                  Notifications
                </Label>
                <Switch
                  id="notifications-toggle"
                  size="sm"
                  checked={notificationsEnabled}
                  onCheckedChange={handleNotificationToggle}
                />
              </div>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={customDialogOpen} onOpenChange={setCustomDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Custom Timer</DialogTitle>
            <DialogDescription>
              Set custom work and break durations in minutes.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="work-duration">Work (min)</Label>
              <Input
                id="work-duration"
                type="number"
                min={1}
                max={240}
                value={workMinutes}
                onChange={(e) => setWorkMinutes(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="break-duration">Break (min)</Label>
              <Input
                id="break-duration"
                type="number"
                min={1}
                max={60}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(Number(e.target.value))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCustomApply}>Apply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leisureDialogOpen} onOpenChange={setLeisureDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leisure processes</DialogTitle>
            <DialogDescription>
              Foreground time in these executables counts toward leisure when computing the session verdict.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-1.5">
            {leisureProcesses.length === 0 ? (
              <span className="text-xs text-muted-foreground">No processes flagged.</span>
            ) : (
              leisureProcesses.map((exe) => (
                <span
                  key={exe}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
                >
                  <span className="font-mono">{exe}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${exe}`}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => onRemoveLeisureProcess(exe)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="e.g. brave.exe"
              value={leisureInput}
              onChange={(e) => setLeisureInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddLeisure();
                }
              }}
            />
            <Button type="button" onClick={handleAddLeisure}>
              Add
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeisureDialogOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
