import { CalendarDays } from "lucide-react";
import { Button } from "../ui/button";
import { Calendar } from "../ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { formatDateDisplay, parseDate } from "./analyzeWorkspace.helpers";
import { formatDate } from "./analyzeWorkspace.constants";

type DatePickerFieldProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
};

export function DatePickerField({ value, onChange, placeholder }: DatePickerFieldProps) {
  const selected = value ? parseDate(value) : undefined;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="form-date-trigger">
          <span>{value ? formatDateDisplay(value) : placeholder || "Select date"}</span>
          <CalendarDays className="h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          onSelect={(date) => {
            if (!date) return;
            onChange(formatDate(date));
          }}
          initialFocus
          captionLayout="dropdown-buttons"
          fromYear={2000}
          toYear={2035}
        />
      </PopoverContent>
    </Popover>
  );
}
