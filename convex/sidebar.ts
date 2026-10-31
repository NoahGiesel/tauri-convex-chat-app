import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, getProfile, requireProfile } from "./model";

const MAX_FOLDERS = 20;
const MAX_CHATS = 300;
const MAX_NAME = 40;
const FOLDER_ID = /^[A-Za-z0-9-]{1,64}$/;
const BUILTIN = ["groups", "direct"];

/** Come l'utente ha organizzato la barra laterale: cartelle e ordine delle sezioni. */
export const layout = query({
  args: {},
  handler: async (ctx) => {
    const me = await getProfile(ctx);
    if (!me) return null;
    return { folders: me.sidebarFolders ?? [], order: me.sidebarOrder ?? [], chatOrder: me.sidebarChatOrder ?? [] };
  },
});

/** Salva l'organizzazione intera (il client la ricalcola a ogni trascinamento). */
export const save = mutation({
  args: {
    folders: v.array(v.object({ id: v.string(), name: v.string(), chatIds: v.array(v.id("conversations")) })),
    order: v.array(v.string()),
    chatOrder: v.array(v.id("conversations")),
  },
  handler: async (ctx, args) => {
    const me = await requireProfile(ctx);
    if (args.chatOrder.length > MAX_CHATS || new Set(args.chatOrder).size !== args.chatOrder.length) throw fail("invalid_layout");
    if (args.folders.length > MAX_FOLDERS || args.order.length > MAX_FOLDERS + BUILTIN.length) throw fail("invalid_layout");

    const folderIds = new Set<string>();
    const chatIds = new Set<Id<"conversations">>();
    const folders = args.folders.map((f) => {
      const name = f.name.trim();
      if (!FOLDER_ID.test(f.id) || BUILTIN.includes(f.id) || folderIds.has(f.id)) throw fail("invalid_layout");
      if (name.length < 1 || name.length > MAX_NAME) throw fail("invalid_layout");
      folderIds.add(f.id);
      for (const id of f.chatIds) {
        if (chatIds.has(id)) throw fail("invalid_layout"); // una chat sta al massimo in una cartella
        chatIds.add(id);
      }
      return { id: f.id, name, chatIds: f.chatIds };
    });
    if (chatIds.size > MAX_CHATS) throw fail("invalid_layout");

    // Si possono mettere in cartella solo chat di cui si è membri.
    for (const id of chatIds) {
      const member = await ctx.db
        .query("members")
        .withIndex("by_conversation_and_profile", (q) => q.eq("conversationId", id).eq("profileId", me._id))
        .unique();
      if (!member) throw fail("not_member");
    }

    const valid = new Set([...BUILTIN, ...folderIds]);
    const order = [...new Set(args.order)].filter((id) => valid.has(id));
    await ctx.db.patch("profiles", me._id, { sidebarFolders: folders, sidebarOrder: order, sidebarChatOrder: args.chatOrder });
  },
});
