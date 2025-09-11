import Guard from "../Util/Guard.js";
export class CryoEventEmitter {
    target = new EventTarget();
    on(type, listener) {
        Guard.CastAs(type);
        this.target.addEventListener(type, (e) => {
            listener(e.detail);
        });
    }
    emit(type, payload) {
        Guard.CastAs(type);
        this.target.dispatchEvent(new CustomEvent(type, { detail: payload }));
    }
}
