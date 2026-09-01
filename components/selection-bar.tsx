"use client";

// Selection bar SHELL (P2 card-5b) — the floating bottom-center pill from the
// canvas selBar style. In P2 nothing can select a document yet, so the bar
// stays hidden (selection context defaults to empty) but the full structure,
// animation and working states are in place for P3 to drive: stacked file
// icons, "N documents selected", Generate briefing, Open, Rename, Delete
// (danger), Clear (link). Every value comes from the canvas renderVals()
// (selBar / selIcons / countLabel / vRule).
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DangerButton,
  GhostButton,
  LinkButton,
  PrimaryButton,
} from "@/components/ui-sn/buttons";
import { FileIcon, type FileExt } from "@/components/ui-sn/file-icon";
import { EditIcon, OpenIcon, SparkIcon, TrashIcon } from "@/components/ui-sn/icons";

export type SelectionItem = {
  id: string;
  name: string;
  ext: FileExt | (string & {});
};

type SelectionContextValue = {
  items: SelectionItem[];
  setItems: (items: SelectionItem[]) => void;
  clear: () => void;
};

// Empty default: with no provider the bar simply never shows (count 0).
const SelectionContext = createContext<SelectionContextValue>({
  items: [],
  setItems: () => {},
  clear: () => {},
});

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SelectionItem[]>([]);
  const clear = useCallback(() => setItems([]), []);
  const value = useMemo(() => ({ items, setItems, clear }), [items, clear]);
  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** Read/write the current document selection (P3 populates it from tiles). */
export function useSelection(): SelectionContextValue {
  return useContext(SelectionContext);
}

export function SelectionBar({
  onGenerate,
  onOpen,
  onRename,
  onDelete,
  renameTitle,
  deleteTitle,
  deleting = false,
}: {
  /** P3 handlers; a missing handler renders its button disabled, honestly. */
  onGenerate?: () => void;
  onOpen?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
  /** Tooltip for a (still-)disabled Rename, naming the card that ships it. */
  renameTitle?: string;
  /** Tooltip for a (still-)disabled Delete, naming the card that ships it. */
  deleteTitle?: string;
  /** Working state for the delete action (rule 10), driven by P3. */
  deleting?: boolean;
}) {
  const { items, clear } = useSelection();
  const visible = items.length > 0;

  return (
    <div
      aria-hidden={!visible}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 24,
        transform: `translateX(-50%) translateY(${visible ? "0" : "18px"})`,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "9px 14px",
        borderRadius: 100,
        background: "var(--sn-sheet)",
        border: "1px solid var(--sn-border)",
        boxShadow: "var(--sn-selbar-shadow)",
        zIndex: 45,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition:
          "opacity .2s ease,transform .24s cubic-bezier(.2,.8,.3,1)",
        maxWidth: "calc(100vw - 32px)",
        overflowX: "auto",
      }}
    >
      <span style={{ display: "flex", alignItems: "center" }}>
        {items.slice(0, 6).map((item) => (
          <FileIcon
            key={item.id}
            ext={item.ext}
            size="sm"
            style={{ marginRight: -5 }}
          />
        ))}
      </span>
      <span style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
        {items.length === 1
          ? "1 document selected"
          : `${items.length} documents selected`}
      </span>
      <span
        style={{ width: 1, height: 20, background: "var(--sn-border)" }}
      />
      <PrimaryButton type="button" onClick={onGenerate} disabled={!onGenerate}>
        <SparkIcon size={14} />
        Generate briefing
      </PrimaryButton>
      <GhostButton type="button" size="sm" onClick={onOpen} disabled={!onOpen}>
        <OpenIcon size={13} />
        Open
      </GhostButton>
      <GhostButton
        type="button"
        size="sm"
        onClick={onRename}
        disabled={!onRename}
        title={onRename ? undefined : renameTitle}
      >
        <EditIcon size={13} />
        Rename
      </GhostButton>
      <DangerButton
        type="button"
        onClick={onDelete}
        disabled={!onDelete}
        title={onDelete ? undefined : deleteTitle}
        working={deleting}
        workingLabel="Deleting…"
      >
        <TrashIcon size={13} />
        Delete
      </DangerButton>
      <LinkButton type="button" onClick={clear}>
        Clear
      </LinkButton>
    </div>
  );
}
