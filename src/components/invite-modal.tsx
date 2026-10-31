import { useDeferredValue, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Copy, Search } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Avatar } from "@/components/avatar";
import { Modal } from "@/components/modal";
import { useI18n } from "@/i18n/i18n-provider";
import { errorKey } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { modalFieldClass, outlineButtonClass, primaryButtonClass, sectionLabelClass } from "@/lib/ui-classes";

const LINK_PREFIX = "chat://invite/";

/** Accetta sia il link completo sia il solo codice. */
const tokenFromInput = (input: string) => input.trim().replace(/\/+$/, "").split("/").pop() ?? "";

export function InviteModal({
  onClose,
  onOpenChat,
}: {
  onClose: () => void;
  onOpenChat: (id: Id<"conversations">) => void;
}) {
  const { t } = useI18n();
  const data = useQuery(api.friends.list);
  const existingToken = useQuery(api.invites.mine);
  const createInvite = useMutation(api.invites.create);
  const redeemInvite = useMutation(api.invites.redeem);
  const acceptRequest = useMutation(api.friends.accept);
  const requestFriend = useMutation(api.friends.request);
  const removeFriendship = useMutation(api.friends.remove);

  const [createdToken, setCreatedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pasted, setPasted] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const people = useQuery(api.users.search, { query: deferredSearch });
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const token = createdToken ?? existingToken ?? null;
  const link = token ? LINK_PREFIX + token : "";

  async function run(action: () => Promise<unknown>) {
    setNotice(null);
    try {
      const okText = await action();
      if (typeof okText === "string" && okText) setNotice({ kind: "ok", text: okText });
    } catch (e) {
      setNotice({ kind: "error", text: t(errorKey(e)) });
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Il link resta selezionabile a mano.
    }
  }

  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const friends = data?.friends ?? [];

  return (
    <Modal title={t("invite.title")} onClose={onClose}>
      <div className="flex flex-col gap-2">
        <label htmlFor="mylink" className="text-[13px] font-bold text-app-text-soft">
          {t("invite.yourLink")}
        </label>
        {token ? (
          <div className="flex gap-2">
            <input
              id="mylink"
              readOnly
              value={link}
              onFocus={(e) => e.currentTarget.select()}
              className={cn(modalFieldClass, "font-mono")}
            />
            <button type="button" onClick={() => void copyLink()} className={cn(primaryButtonClass, "h-12 px-[18px] text-[15px]")}>
              <Copy className="size-[18px]" strokeWidth={2} />
              {copied ? t("people.copied") : t("people.copy")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => void run(async () => setCreatedToken(await createInvite()))}
            className={cn(outlineButtonClass, "h-12 self-start px-[18px] text-[15px]")}
          >
            {t("invite.createLink")}
          </button>
        )}
        <p className="text-[13px] text-app-text-muted">{t("invite.validity")}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="people-search" className="text-[13px] font-bold text-app-text-soft">
          {t("invite.searchLabel")}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-4 left-4 size-4 text-app-text-dim" strokeWidth={2} />
          <input
            id="people-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("invite.searchPlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className={cn(modalFieldClass, "pl-10")}
          />
        </div>
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {people && people.length === 0 && <p className="px-1 py-2 text-sm text-app-text-muted">{t("invite.noUsers")}</p>}
          {people?.map((p) => (
            <div key={p._id} className="flex items-center gap-3 rounded-xl p-1.5">
              <Avatar name={p.name} index={p.avatarIndex} src={p.avatarUrl} size={36} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold text-app-text-strong">{p.name}</span>
                {p.bio && <span className="block truncate text-[13px] text-app-text-muted">{p.bio}</span>}
              </span>
              {p.relation === "friend" && <span className="text-sm font-semibold text-app-online">{t("invite.alreadyFriend")}</span>}
              {p.relation === "outgoing" && <span className="text-sm text-app-text-muted">{t("people.waiting")}</span>}
              {(p.relation === "none" || p.relation === "incoming") && (
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      const outcome = await requestFriend({ profileId: p._id });
                      const messages = {
                        requested: "people.redeemRequested",
                        accepted: "people.redeemAccepted",
                        already_friends: "people.redeemAlreadyFriends",
                        already_requested: "people.redeemAlreadyRequested",
                      } as const;
                      return t(messages[outcome]);
                    })
                  }
                  className={cn(p.relation === "incoming" ? primaryButtonClass : outlineButtonClass, "h-9 px-4 text-sm")}
                >
                  {p.relation === "incoming" ? t("people.accept") : t("invite.add")}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const value = tokenFromInput(pasted);
          if (!value) return;
          void run(async () => {
            const outcome = await redeemInvite({ token: value });
            setPasted("");
            const messages = {
              requested: "people.redeemRequested",
              accepted: "people.redeemAccepted",
              already_friends: "people.redeemAlreadyFriends",
              already_requested: "people.redeemAlreadyRequested",
            } as const;
            return t(messages[outcome]);
          });
        }}
      >
        <label htmlFor="paste" className="text-[13px] font-bold text-app-text-soft">
          {t("invite.gotLink")}
        </label>
        <div className="flex gap-2">
          <input
            id="paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder={t("invite.pastePlaceholder")}
            autoComplete="off"
            spellCheck={false}
            className={modalFieldClass}
          />
          <button type="submit" disabled={tokenFromInput(pasted).length === 0} className={cn(outlineButtonClass, "h-12 px-[18px] text-[15px]")}>
            {t("invite.add")}
          </button>
        </div>
      </form>

      {notice && (
        <p
          role={notice.kind === "error" ? "alert" : "status"}
          className={cn("text-sm", notice.kind === "error" ? "text-destructive" : "text-app-online")}
        >
          {notice.text}
        </p>
      )}

      {(incoming.length > 0 || outgoing.length > 0) && (
        <>
          <div className="h-px bg-app-border" />
          <div className="flex flex-col gap-2.5">
            <div className={cn(sectionLabelClass, "flex items-center gap-2 text-[13px] tracking-[0.06em]")}>
              {t("invite.pending")}
              <span className="flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-app-accent px-1.5 text-xs text-app-accent-fg">
                {incoming.length + outgoing.length}
              </span>
            </div>

            {incoming.map((r) => (
              <div key={r.friendshipId} className="flex items-center gap-3 rounded-[14px] border border-app-border bg-app-bg p-2.5">
                <Avatar name={r.profile.name} index={r.profile.avatarIndex} src={r.profile.avatarUrl} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-app-text-strong">{r.profile.name}</div>
                  <div className="text-[13px] text-app-text-muted">{t("invite.wantsToAdd")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void run(() => removeFriendship({ friendshipId: r.friendshipId }))}
                  className={cn(outlineButtonClass, "h-9 px-3.5 text-sm text-app-text-soft")}
                >
                  {t("people.decline")}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void run(async () => {
                      onOpenChat(await acceptRequest({ friendshipId: r.friendshipId }));
                      onClose();
                    })
                  }
                  className={cn(primaryButtonClass, "h-9 px-4 text-sm")}
                >
                  {t("people.accept")}
                </button>
              </div>
            ))}

            {outgoing.map((r) => (
              <div key={r.friendshipId} className="flex items-center gap-3 rounded-[14px] border border-app-border bg-app-bg p-2.5">
                <Avatar name={r.profile.name} index={r.profile.avatarIndex} src={r.profile.avatarUrl} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-bold text-app-text-strong">{r.profile.name}</div>
                  <div className="text-[13px] text-app-text-muted">{t("people.waiting")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => void run(() => removeFriendship({ friendshipId: r.friendshipId }))}
                  className={cn(outlineButtonClass, "h-9 px-3.5 text-sm text-app-text-soft")}
                >
                  {t("people.cancelRequest")}
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {friends.length > 0 && (
        <>
          <div className="h-px bg-app-border" />
          <div className="flex flex-col gap-2.5">
            <div className={cn(sectionLabelClass, "tracking-[0.06em]")}>{t("invite.friends")}</div>
            {friends.map((f) => (
              <div key={f.friendshipId} className="flex items-center gap-3">
                <Avatar name={f.profile.name} index={f.profile.avatarIndex} src={f.profile.avatarUrl} size={36} />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-app-text-strong">{f.profile.name}</span>
                <button
                  type="button"
                  onClick={() => void run(() => removeFriendship({ friendshipId: f.friendshipId }))}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-semibold text-app-text-muted hover:bg-app-field hover:text-app-text"
                >
                  {t("people.remove")}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
