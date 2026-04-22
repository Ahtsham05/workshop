import { useState, useMemo, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Wand2,
  ChevronRight,
  ChevronLeft,
  Clock,
  Coffee,
  Utensils,
  BookOpen,
  AlertCircle,
  Loader2,
  Check,
  Moon,
  Plus,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ALL_DAYS,
  DAY_LABELS,
  DURATION_OPTIONS,
  DEFAULT_CONFIG,
  generateTimeSlots,
  validateConfig,
  summarizeSlots,
  type ScheduleConfig,
  type SlotPreview,
  type DayKey,
  type ShortDay,
} from '../utils/timeSlotGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 'configure' | 'preview';

export interface WizardResult {
  config: ScheduleConfig;
  slots: SlotPreview[];
}

export type WizardMode = 'single' | 'bulk';

interface AutoGenerateWizardProps {
  open: boolean;
  onClose: () => void;
  /** Called when the user finalises the wizard and clicks "Generate Timetable" */
  onConfirm: (result: WizardResult) => Promise<void>;
  /** Shown in the dialog title: "for Class 5" */
  classLabel?: string;
  /** 'single' = one class, 'bulk' = all classes */
  mode?: WizardMode;
}

// ─── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: WizardStep }) {
  return (
    <div className="flex items-center gap-2 print:hidden">
      {/* Step 1 */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold border',
            step === 'configure'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-emerald-500 text-white border-emerald-500',
          )}
        >
          {step === 'configure' ? '1' : <Check className="h-3 w-3" />}
        </div>
        <span
          className={cn(
            'text-xs font-medium',
            step === 'configure' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          Configure
        </span>
      </div>

      <ChevronRight className="h-3 w-3 text-muted-foreground/50 shrink-0" />

      {/* Step 2 */}
      <div className="flex items-center gap-1.5">
        <div
          className={cn(
            'h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-bold border',
            step === 'preview'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground border-border',
          )}
        >
          2
        </div>
        <span
          className={cn(
            'text-xs font-medium',
            step === 'preview' ? 'text-foreground' : 'text-muted-foreground',
          )}
        >
          Preview &amp; Generate
        </span>
      </div>
    </div>
  );
}

// ─── Slot row (preview table row) ────────────────────────────────────────────

function SlotRow({ slot, index }: { slot: SlotPreview; index: number }) {
  const isBreak = slot.type !== 'class';

  return (
    <tr
      className={cn(
        'border-b border-border/20 last:border-b-0',
        isBreak ? 'bg-amber-50/70' : index % 2 === 0 ? 'bg-background' : 'bg-muted/10',
      )}
    >
      {/* Icon + label */}
      <td className="py-2.5 px-3">
        <div className="flex items-center gap-2">
          {slot.type === 'class' ? (
            <BookOpen className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
          ) : slot.type === 'lunch' ? (
            <Utensils className="h-3.5 w-3.5 text-amber-600 shrink-0" />
          ) : (
            <Coffee className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          )}
          <span
            className={cn(
              'text-xs font-semibold',
              slot.type === 'class' ? 'text-foreground' : 'text-amber-700',
            )}
          >
            {slot.label}
          </span>
        </div>
      </td>

      {/* Time range */}
      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
        <div className="flex items-center gap-1">
          <Clock className="h-3 w-3 shrink-0" />
          {slot.startTime} – {slot.endTime}
        </div>
      </td>

      {/* Duration */}
      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {(() => {
          const [sh, sm] = slot.startTime.split(':').map(Number);
          const [eh, em] = slot.endTime.split(':').map(Number);
          return `${(eh * 60 + em) - (sh * 60 + sm)} min`;
        })()}
      </td>

      {/* Type badge */}
      <td className="py-2.5 px-3">
        <Badge
          variant="outline"
          className={cn(
            'text-[10px] px-1.5 py-0 capitalize',
            slot.type === 'class'
              ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
              : slot.type === 'lunch'
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-orange-200 bg-orange-50 text-orange-700',
          )}
        >
          {slot.type}
        </Badge>
      </td>
    </tr>
  );
}

// ─── Day toggle ───────────────────────────────────────────────────────────────

function DayToggle({
  day,
  active,
  onToggle,
}: {
  day: DayKey;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all select-none',
        active
          ? 'bg-primary text-primary-foreground border-primary shadow-sm'
          : 'bg-muted/30 text-muted-foreground border-border/50 hover:bg-muted/50',
      )}
    >
      {DAY_LABELS[day]}
    </button>
  );
}

// ─── Step 1: Configure form ───────────────────────────────────────────────────

interface ConfigStepProps {
  config: ScheduleConfig;
  onChange: (partial: Partial<ScheduleConfig>) => void;
  errors: string[];
  onNext: () => void;
}

// ─── Short Days section ───────────────────────────────────────────────────────

interface ShortDaysSectionProps {
  config: ScheduleConfig;
  onChange: (partial: Partial<ScheduleConfig>) => void;
}

function ShortDaysSection({ config, onChange }: ShortDaysSectionProps) {
  const shortDays: ShortDay[] = config.shortDays ?? [];

  const availableDays = config.days.filter((d) => !shortDays.some((sd) => sd.day === d));

  const addShortDay = () => {
    if (availableDays.length === 0) return;
    const next: ShortDay[] = [...shortDays, { day: availableDays[0], endTime: '12:00' }];
    onChange({ shortDays: next });
  };

  const removeShortDay = (idx: number) => {
    onChange({ shortDays: shortDays.filter((_, i) => i !== idx) });
  };

  const updateShortDay = (idx: number, patch: Partial<ShortDay>) => {
    onChange({ shortDays: shortDays.map((sd, i) => (i === idx ? { ...sd, ...patch } : sd)) });
  };

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Moon className="h-3.5 w-3.5 text-indigo-500" />
          <Label className="text-xs font-semibold">Short Days</Label>
          <span className="text-[10px] text-muted-foreground ml-0.5">(optional)</span>
        </div>
        {availableDays.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 px-2"
            onClick={addShortDay}
          >
            <Plus className="h-3 w-3" />
            Add
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        Configure days that end earlier (e.g. Friday ends at 12:00 PM).
        Periods starting at or after the cut-off won't run on that day.
      </p>

      {shortDays.length === 0 && (
        <div className="rounded-md border border-dashed border-border/60 bg-muted/10 py-3 px-3 text-center text-[11px] text-muted-foreground/60">
          No short days configured — all days use the full schedule
        </div>
      )}

      {shortDays.map((sd, idx) => (
        <div
          key={idx}
          className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/15 p-2.5"
        >
          {/* Day selector */}
          <Select
            value={sd.day}
            onValueChange={(v) => updateShortDay(idx, { day: v as DayKey })}
          >
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {/* allow current + available days */}
              {config.days
                .filter((d) => d === sd.day || !shortDays.some((x, i) => i !== idx && x.day === d))
                .map((d) => (
                  <SelectItem key={d} value={d} className="text-xs capitalize">
                    {DAY_LABELS[d as DayKey]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground whitespace-nowrap">ends at</span>

          <Input
            type="time"
            value={sd.endTime}
            onChange={(e) => updateShortDay(idx, { endTime: e.target.value })}
            className="h-8 w-28 text-xs"
          />

          <button
            type="button"
            onClick={() => removeShortDay(idx)}
            className="ml-auto text-muted-foreground/60 hover:text-destructive transition-colors p-0.5"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Configure form ───────────────────────────────────────────────────

function ConfigureStep({ config, onChange, errors, onNext }: ConfigStepProps) {
  return (
    <div className="space-y-5">
      {/* ── Timing row ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Lecture Start Time <span className="text-destructive">*</span>
          </Label>
          <Input
            type="time"
            value={config.startTime}
            onChange={(e) => onChange({ startTime: e.target.value })}
            className="h-9"
          />
          <p className="text-[10px] text-muted-foreground">When the first period begins</p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">
            Lecture Duration <span className="text-destructive">*</span>
          </Label>
          <Select
            value={String(config.lectureDuration)}
            onValueChange={(v) => onChange({ lectureDuration: Number(v) })}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Periods per day ── */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">
          Periods Per Day <span className="text-destructive">*</span>
        </Label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 text-base font-bold"
            onClick={() => onChange({ periodsPerDay: Math.max(1, config.periodsPerDay - 1) })}
          >
            –
          </Button>
          <Input
            type="number"
            min={1}
            max={15}
            value={config.periodsPerDay}
            onChange={(e) =>
              onChange({ periodsPerDay: Math.max(1, Math.min(15, Number(e.target.value))) })
            }
            className="h-9 w-20 text-center font-semibold"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0 text-base font-bold"
            onClick={() => onChange({ periodsPerDay: Math.min(15, config.periodsPerDay + 1) })}
          >
            +
          </Button>
          <span className="text-xs text-muted-foreground">class periods (breaks excluded)</span>
        </div>
      </div>

      <Separator />

      {/* ── Break configuration ── */}
      <div className="space-y-3">
        <Label className="text-xs font-semibold">Break Configuration</Label>

        {/* Break type selector */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ breakType: 'after-n' })}
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg border text-left transition-all',
              config.breakType === 'after-n'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/60 hover:border-border bg-muted/20',
            )}
          >
            <div
              className={cn(
                'h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                config.breakType === 'after-n' ? 'border-primary' : 'border-muted-foreground/40',
              )}
            >
              {config.breakType === 'after-n' && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">After N Periods</p>
              <p className="text-[10px] text-muted-foreground">Break every N class periods</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChange({ breakType: 'fixed' })}
            className={cn(
              'flex items-center gap-2 p-3 rounded-lg border text-left transition-all',
              config.breakType === 'fixed'
                ? 'border-primary bg-primary/5 shadow-sm'
                : 'border-border/60 hover:border-border bg-muted/20',
            )}
          >
            <div
              className={cn(
                'h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center',
                config.breakType === 'fixed' ? 'border-primary' : 'border-muted-foreground/40',
              )}
            >
              {config.breakType === 'fixed' && (
                <div className="h-2 w-2 rounded-full bg-primary" />
              )}
            </div>
            <div>
              <p className="text-xs font-semibold text-foreground">Fixed Time Range</p>
              <p className="text-[10px] text-muted-foreground">Break at a fixed clock time</p>
            </div>
          </button>
        </div>

        {/* After-N options */}
        {config.breakType === 'after-n' && (
          <div className="flex items-center gap-3 pl-1 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Break after every</span>
            <Input
              type="number"
              min={1}
              max={10}
              value={config.breakAfterN}
              onChange={(e) => onChange({ breakAfterN: Math.max(1, Number(e.target.value)) })}
              className="h-8 w-16 text-center text-xs"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">periods for</span>
            <Input
              type="number"
              min={5}
              max={120}
              step={5}
              value={config.breakDurationMin}
              onChange={(e) =>
                onChange({ breakDurationMin: Math.max(5, Number(e.target.value)) })
              }
              className="h-8 w-16 text-center text-xs"
            />
            <span className="text-xs text-muted-foreground">min</span>
          </div>
        )}

        {/* Fixed time range options */}
        {config.breakType === 'fixed' && (
          <div className="flex items-center gap-3 pl-1 flex-wrap">
            <span className="text-xs text-muted-foreground whitespace-nowrap">Break from</span>
            <Input
              type="time"
              value={config.fixedBreakStart}
              onChange={(e) => onChange({ fixedBreakStart: e.target.value })}
              className="h-8 w-30 text-xs"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="time"
              value={config.fixedBreakEnd}
              onChange={(e) => onChange({ fixedBreakEnd: e.target.value })}
              className="h-8 w-30 text-xs"
            />
          </div>
        )}
      </div>

      <Separator />

      {/* ── Days selection ── */}
      <div className="space-y-2">
        <Label className="text-xs font-semibold">Days of the Week</Label>
        <div className="flex gap-2 flex-wrap">
          {ALL_DAYS.map((day) => (
            <DayToggle
              key={day}
              day={day}
              active={config.days.includes(day)}
              onToggle={() => {
                const next = config.days.includes(day)
                  ? config.days.filter((d) => d !== day)
                  : [...config.days, day as DayKey];
                onChange({ days: next });
              }}
            />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          {config.days.length} day{config.days.length !== 1 ? 's' : ''} selected
        </p>
      </div>

      <Separator />

      {/* ── Short Days ── */}
      <ShortDaysSection config={config} onChange={onChange} />

      {/* ── Validation errors ── */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-1">
          {errors.map((e, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              {e}
            </div>
          ))}
        </div>
      )}

      {/* ── Actions ── */}
      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={errors.length > 0}
          className={
            'gap-2 text-white border-0 ' +
            'bg-gradient-to-r from-indigo-500 to-violet-500 ' +
            'hover:from-indigo-600 hover:to-violet-600 ' +
            'disabled:opacity-50'
          }
        >
          Preview Schedule
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ─── Step 2: Preview + Confirm ────────────────────────────────────────────────

interface PreviewStepProps {
  slots: SlotPreview[];
  config: ScheduleConfig;
  onBack: () => void;
  onConfirm: () => Promise<void>;
  isLoading: boolean;
  mode: WizardMode;
}

function PreviewStep({ slots, config, onBack, onConfirm, isLoading, mode }: PreviewStepProps) {
  const summary = useMemo(() => summarizeSlots(slots), [slots]);

  const classPeriods = slots.filter((s) => s.type === 'class').length;
  const breakSlots   = slots.filter((s) => s.type !== 'class');

  return (
    <div className="space-y-4">
      {/* Summary stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Class Periods', value: classPeriods, color: 'text-indigo-600' },
          { label: 'Break Slots',   value: breakSlots.length, color: 'text-amber-600' },
          { label: 'Break (total)', value: `${summary.totalBreakMin} min`, color: 'text-orange-600' },
          { label: 'School Day',    value: `${summary.schoolDayStartTime} – ${summary.schoolDayEndTime}`, color: 'text-emerald-600' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg border border-border/50 bg-muted/20 p-3 text-center">
            <p className={cn('text-base font-bold', stat.color)}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Days selected + short day badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Applied to:</span>
        {config.days.map((d) => {
          const shortDay = (config.shortDays ?? []).find((sd) => sd.day === d);
          return (
            <Badge
              key={d}
              variant="outline"
              className={cn(
                'text-[10px] capitalize py-0 gap-1',
                shortDay && 'border-indigo-200 bg-indigo-50 text-indigo-700',
              )}
            >
              {shortDay && <Moon className="h-2.5 w-2.5" />}
              {DAY_LABELS[d as DayKey]}
              {shortDay && (
                <span className="font-normal text-indigo-500">→ {shortDay.endTime}</span>
              )}
            </Badge>
          );
        })}
      </div>

      {/* Slot preview table */}
      <div className="rounded-lg border border-border overflow-hidden max-h-[44vh] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted/60 border-b border-border/50">
              <th className="py-2 px-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[40%]">
                Period / Label
              </th>
              <th className="py-2 px-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[30%]">
                Time Range
              </th>
              <th className="py-2 px-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[15%]">
                Duration
              </th>
              <th className="py-2 px-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-[15%]">
                Type
              </th>
            </tr>
          </thead>
          <tbody>
            {slots.map((slot, i) => (
              <SlotRow key={i} slot={slot} index={i} />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground/70">
        These time slots will be saved and the timetable will be auto-generated using this schedule.
      </p>

      {/* Actions */}
      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5 text-muted-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to Configure
        </Button>

        <Button
          disabled={isLoading}
          onClick={onConfirm}
          className={
            'gap-2 text-white border-0 ' +
            'bg-gradient-to-r from-indigo-500 to-violet-500 ' +
            'hover:from-indigo-600 hover:to-violet-600 ' +
            'disabled:opacity-50'
          }
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {isLoading ? 'Generating…' : mode === 'bulk' ? 'Generate All Classes' : 'Generate Timetable'}
        </Button>
      </div>
    </div>
  );
}

// ─── Main Wizard Component ────────────────────────────────────────────────────

/**
 * Two-step modal wizard for smart timetable auto-generation.
 *
 * Step 1 — Configure: Set lecture timing, periods, break, and days.
 * Step 2 — Preview:   See the generated time slots before confirming.
 *
 * On confirm, calls `onConfirm({ config, slots })` — the parent is
 * responsible for saving slots and calling the generate API.
 */
export function AutoGenerateWizard({
  open,
  onClose,
  onConfirm,
  classLabel,
  mode = 'single',
}: AutoGenerateWizardProps) {
  const [step, setStep] = useState<WizardStep>('configure');
  const [config, setConfig] = useState<ScheduleConfig>({ ...DEFAULT_CONFIG });
  const [previewSlots, setPreviewSlots] = useState<SlotPreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Live validation
  const errors = useMemo(() => validateConfig(config), [config]);

  const handleChange = useCallback((partial: Partial<ScheduleConfig>) => {
    setConfig((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleNext = useCallback(() => {
    if (errors.length > 0) return;
    const slots = generateTimeSlots(config);
    setPreviewSlots(slots);
    setStep('preview');
  }, [config, errors]);

  const handleBack = useCallback(() => {
    setStep('configure');
  }, []);

  const handleConfirmGenerate = useCallback(async () => {
    setIsLoading(true);
    try {
      await onConfirm({ config, slots: previewSlots });
      // Close after success — parent will show toast
      onClose();
      // Reset for next opening
      setStep('configure');
      setConfig({ ...DEFAULT_CONFIG });
    } finally {
      setIsLoading(false);
    }
  }, [config, previewSlots, onConfirm, onClose]);

  // Reset to step 1 when modal is opened
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      onClose();
      // Small delay so animation completes before resetting
      setTimeout(() => {
        setStep('configure');
        setConfig({ ...DEFAULT_CONFIG });
      }, 300);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40 shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-indigo-500 shrink-0" />
                {mode === 'bulk' ? 'Generate All Timetables' : 'Auto-Generate Timetable'}
                {classLabel && (
                  <span className="text-muted-foreground font-normal text-sm">
                    · {classLabel}
                  </span>
                )}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure your schedule, preview, then generate in one click
              </p>
            </div>
            <StepIndicator step={step} />
          </div>
        </DialogHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {step === 'configure' ? (
            <ConfigureStep
              config={config}
              onChange={handleChange}
              errors={errors}
              onNext={handleNext}
            />
          ) : (
            <PreviewStep
              slots={previewSlots}
              config={config}
              onBack={handleBack}
              onConfirm={handleConfirmGenerate}
              isLoading={isLoading}
              mode={mode}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
