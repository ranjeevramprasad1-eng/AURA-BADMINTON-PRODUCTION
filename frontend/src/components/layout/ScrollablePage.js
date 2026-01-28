"use client";

import { cn } from "@/lib/utils";

/**
 * ScrollablePage - A reusable wrapper component that provides consistent
 * scrollable container behavior across all pages using the Composite Pattern.
 * 
 * Features:
 * - Fixed header area (stays at top) via ScrollablePageHeader
 * - Scrollable content area (scrolls independently) via ScrollablePageContent
 * - Accounts for bottom navigation
 * 
 * Usage:
 * ```jsx
 * <ScrollablePage>
 *   <ScrollablePageHeader>
 *     <header>...</header>
 *   </ScrollablePageHeader>
 *   <ScrollablePageContent>
 *     <div>Scrollable content</div>
 *   </ScrollablePageContent>
 * </ScrollablePage>
 * ```
 */
export function ScrollablePage({ children, className }) {
  return (
    <div
      className={cn(
        "flex flex-col h-[calc(100vh-2.5rem)] overflow-hidden relative",
        className
      )}
    >
      {children}
    </div>
  );
}

/**
 * ScrollablePageHeader - Fixed header area that stays at the top
 */
export function ScrollablePageHeader({ children, className }) {
  return (
    <div className={cn("shrink-0 sticky top-0", className)}>
      {children}
    </div>
  );
}

/**
 * ScrollablePageContent - Scrollable content area
 */
export function ScrollablePageContent({ children, className }) {
  return (
    <div className={cn("flex-1 overflow-y-scroll overflow-x-hidden scrollbar-none pb-24", className)}>
      {children}
    </div>
  );
}

