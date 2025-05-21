'use client';

import { type ReactNode, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircleFillIcon, ChevronDownIcon } from './icons';

const webSearchOptions: Array<{
  id: string;
  label: string;
  description: string;
}> = [
  {
    id: 'all',
    label: '---',
    description: 'Search for all options',
  },
  {
    id: 'company',
    label: 'Company',
    description: 'Search for company information',
  },
  {
    id: 'github',
    label: 'GitHub',
    description: 'Search for GitHub repositories',
  },
];

export function SearchDropdown({
  selectedSearchOption,
  setSelectedSearchOption,
}: {
  selectedSearchOption: string | null;
  setSelectedSearchOption: (option: string) => void;
} & React.ComponentProps<typeof Button>) {
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        className="w-fit data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
      >
        <Button
          data-testid="search-option-selector"
          variant="outline"
          className="hidden md:flex md:px-2 md:h-[34px]"
        >
          {
            webSearchOptions.find(
              (option) => option.id === selectedSearchOption,
            )?.label
          }
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[300px]">
        {webSearchOptions.map((option) => (
          <DropdownMenuItem
            data-testid={`search-option-selector-item-${option.id}`}
            key={option.id}
            onSelect={() => {
              console.log('updating option: ', option.id);
              setSelectedSearchOption(option.id);
              setOpen(false);
            }}
            className="gap-4 group/item flex flex-row justify-between items-center"
            data-active={option.id === selectedSearchOption}
          >
            <div className="flex flex-col gap-1 items-start">
              {option.label}
            </div>
            <div className="text-foreground dark:text-foreground opacity-0 group-data-[active=true]/item:opacity-100">
              <CheckCircleFillIcon />
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
