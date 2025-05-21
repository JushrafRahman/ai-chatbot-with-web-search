'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircleFillIcon, ChevronDownIcon } from './icons';

const webSearchOptions = [
  {
    id: 'company',
    label: 'Company',
  },
  {
    id: 'research paper',
    label: 'Research Paper',
  },
  {
    id: 'news',
    label: 'News Article',
  },
  {
    id: 'pdf',
    label: 'PDF',
  },
  {
    id: 'github',
    label: 'Github',
  },
  {
    id: 'personal site',
    label: 'Personal Site',
  },
  {
    id: 'linkedin profile',
    label: 'LinkedIn Profile',
  },
  {
    id: 'financial report',
    label: 'Financial Report',
  },
] as const;

export type WebSearchCategory = (typeof webSearchOptions)[number]['id'];

const clearSelectionCategory = {
  id: 'clear',
  label: '---',
};

export function SearchDropdown({
  selectedSearchCategory,
  setSelectedSearchCategory,
}: {
  selectedSearchCategory?: WebSearchCategory;
  setSelectedSearchCategory?: (option: WebSearchCategory | undefined) => void;
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
              (option) => option.id === selectedSearchCategory,
            )?.label
          }
          <ChevronDownIcon />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="min-w-[300px]">
        {[clearSelectionCategory, ...webSearchOptions].map((option) => (
          <DropdownMenuItem
            data-testid={`search-option-selector-item-${option.id}`}
            key={option.id}
            onSelect={() => {
              if (setSelectedSearchCategory) {
                if (option.id === 'clear') {
                  setSelectedSearchCategory(undefined);
                } else {
                  setSelectedSearchCategory(option.id as WebSearchCategory);
                }
              }
              setOpen(false);
            }}
            className="gap-4 group/item flex flex-row justify-between items-center"
            data-active={option.id === selectedSearchCategory}
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
