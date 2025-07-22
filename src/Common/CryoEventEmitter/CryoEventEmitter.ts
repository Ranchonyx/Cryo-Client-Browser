import Guard from "../Util/Guard.js";

export class CryoEventEmitter<EventMap extends Record<string, any> = Record<string, any>> {
    private target = new EventTarget();

    public on<K extends keyof EventMap>(type: K, listener: (payload: EventMap[K]) => void) {
        Guard.CastAs<string>(type);
        this.target.addEventListener(type, (e: Event) => {
            listener((e as CustomEvent).detail);
        })
    }

    public emit<K extends keyof EventMap>(type: K, payload: EventMap[K]) {
        Guard.CastAs<string>(type);
        this.target.dispatchEvent(new CustomEvent(type, {detail: payload}));
    }
}
