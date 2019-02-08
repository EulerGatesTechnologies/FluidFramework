import {
    Browser,
    ICodeLoader,
    IDocumentService,
    IPlatformFactory,
    ITokenProvider,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { EventEmitter } from "events";
import { IDocumentTaskInfo } from "../definitions";

export class ChaincodeWork extends EventEmitter {

    protected document: Container;
    protected task: string;

    private events = new EventEmitter();

    constructor(
        private readonly docId: string,
        private readonly tenantId: string,
        private readonly tokenProvider: ITokenProvider,
        private readonly service: IDocumentService,
        private readonly codeLoader: ICodeLoader,
        platformFactory: IPlatformFactory,
        task: string) {
            super();
            this.task = task;
    }

    public async loadChaincode(options: any): Promise<void> {
        const loader = new Loader(
            { tokenProvider: this.tokenProvider },
            this.service,
            this.codeLoader,
            options);

        const url =
            `prague://prague.com/` +
            `${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.docId)}`;
        this.document = await loader.resolve({ url });

        this.attachListeners();

        // Wait to be fully connected!
        if (!this.document.connected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }
    }

    public async stop(): Promise<void> {
        // Make sure the document is loaded.
        if (this.document !== undefined) {
            // Remove all listeners and close the document.
            this.document.removeAllListeners();
            this.document.close();
            console.log(`Closed document ${this.document.tenantId}/${this.document.id} for task ${this.task}`);
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListeners() {
        this.events.removeAllListeners();
        this.removeAllListeners();
    }

    private attachListeners() {
        // Emits document relared errors to caller.
        const errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", errorHandler);

        const leaveHandler = (clientId: string) => {
            if (this.document.clientId === clientId) {
                this.requestStop();
            } else {
                if (this.noLeader()) {
                    this.requestStop();
                }
            }
        };
        this.document.getQuorum().on("removeMember", leaveHandler);
    }

    // Emits a stop request message to the caller. The caller will then
    // call stop() to stop the task on the document.
    private requestStop() {
        const stopEvent: IDocumentTaskInfo = {
            docId: this.document.id,
            task: this.task,
            tenantId: this.document.tenantId,
        };
        this.events.emit("stop", stopEvent);
    }

    // A leader is any browser client connected to the document at this moment.
    // The leader election makes sure that the session has a leader as long as there is
    // a browser client connected.
    private noLeader(): boolean {
        for (const client of this.document.getQuorum().getMembers()) {
            if (!client[1].client || !client[1].client.type || client[1].client.type === Browser) {
                return false;
            }
        }
        return true;
    }
}
