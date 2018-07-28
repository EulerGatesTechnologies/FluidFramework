import { api, types } from "@prague/routerlicious/dist/client-api";
import { EventEmitter } from "events";

export interface INote {
    // Document ID for the note data
    id: string;

    // Friendly name of the note
    name: string;

    // Time the note was added to the list
    created: number;
}

export class NoteList extends EventEmitter {
    public static async Load(userName: string, token: string): Promise<NoteList> {
        const document = await api.load(`notes-${userName}`, { token });
        const notes = await document.getRoot();
        const notesView = await notes.getView();

        return new NoteList(notes, notesView);
    }

    private static ParseId(id: string): { id: string, created: number } {
        const split = id.indexOf("-");

        const created = Number.parseInt(id.substring(0, split));
        const documentId = id.substring(split + 1);

        return { id: documentId, created };
    }

    private static CreateId(id: string): string {
        return `${Date.now()}-${id}`;
    }

    private notes = new Map<string, INote>();

    constructor(note: types.IMap, private noteView: types.IMapView) {
        super();

        noteView.forEach((value: string, key: string) => {
            this.addNoteCore(key, value, false);
        });

        note.on(
            "valueChanged",
            (changed, local) => {
                // skip local events
                if (local) {
                    return;
                }

                if (!noteView.has(changed.key)) {
                    // new note or value changed
                    if (this.notes.has(changed.key)) {
                        this.notes.get(changed.key).name = noteView.get(changed.key);
                    } else {
                        this.addNoteCore(changed.key, noteView.get(changed.key), false);
                    }
                } else {
                    // deleted note
                    this.notes.delete(changed.key);
                }

                this.emit("notesChanged");
            });
    }

    public getNotes(): Map<string, INote> {
        return this.notes;
    }

    public addNote(id: string, name: string) {
        const key = NoteList.CreateId(id);
        this.addNoteCore(key, name, true);
        this.emit("notesChanged");
    }

    public on(event: "notesChanged", listener: (...args: any[]) => void): this {
        super.on(event, listener);
        return this;
    }

    private addNoteCore(id: string, name: string, local: boolean) {
        // Add to map view if this is a local insert
        if (!local) {
            this.noteView.set(id, name);
        }

        // And then create the parsed local version
        const parsed = NoteList.ParseId(id);
        const note: INote = {
            created: parsed.created,
            id: parsed.id,
            name,
        };
        this.notes.set(id, note);
    }
}
