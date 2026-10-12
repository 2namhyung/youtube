(function () {
    'use strict';

    /**
     * A base for dispatching {@link Subscribable}s.
     *
     * @typeParam TValue - The type of the argument passed to subscribers.
     * @typeParam THandler - The type of the callback function.
     */
    class EventDispatcherBase {
        constructor() {
            this.subscribable = new Subscribable(this);
            this.subscribers = new Set();
        }
        /**
         * {@inheritDoc Subscribable.subscribe}
         */
        subscribe(handler) {
            this.subscribers.add(handler);
            return () => this.unsubscribe(handler);
        }
        /**
         * {@inheritDoc Subscribable.unsubscribe}
         */
        unsubscribe(handler) {
            this.subscribers.delete(handler);
        }
        /**
         * Unsubscribe all subscribers from the event.
         */
        clear() {
            this.subscribers.clear();
        }
        notifySubscribers(value) {
            return [...this.subscribers].map(handler => handler(value));
        }
    }
    /**
     * Provides safe access to the public interface of {@link EventDispatcherBase}.
     *
     * @remarks
     * External classes can use it to subscribe to an event without being able to
     * dispatch it.
     *
     * @typeParam TValue - The type of the argument passed to subscribers.
     * @typeParam THandler - The type of the callback function.
     */
    class Subscribable {
        constructor(dispatcher) {
            this.dispatcher = dispatcher;
        }
        /**
         * Subscribe to the event.
         *
         * @param handler - The handler to invoke when the event occurs.
         *
         * @returns A callback function that cancels the subscription.
         */
        subscribe(handler) {
            return this.dispatcher.subscribe(handler);
        }
        /**
         * Unsubscribe from the event.
         *
         * @param handler - The handler to unsubscribe.
         */
        unsubscribe(handler) {
            this.dispatcher.unsubscribe(handler);
        }
    }

    /**
     * Dispatches a {@link SubscribableFlagEvent}.
     *
     * @remarks
     * Subscribers are notified only when the flag is set.
     * Subsequent calls to {@link raise} don't trigger anything.
     * Any handlers added while the flag is raised are immediately invoked.
     *
     * Resetting the flag doesn't notify the subscribers, but raising it again does.
     *
     * @example
     * ```ts
     * class Example {
     *   // expose the event to external classes
     *   public get onChanged {
     *     return this.flag.subscribable;
     *   }
     *   // create a private dispatcher
     *   private flag = new FlagDispatcher();
     *
     *   private dispatchExample() {
     *     // setting the flag will notify all subscribers
     *     this.flag.raise();
     *   }
     * }
     * ```
     */
    class FlagDispatcher extends EventDispatcherBase {
        constructor() {
            super(...arguments);
            this.value = false;
        }
        /**
         * Notify all current and future subscribers.
         */
        raise() {
            if (!this.value) {
                this.value = true;
                this.notifySubscribers();
            }
        }
        /**
         * Stop notifying future subscribers.
         */
        reset() {
            this.value = false;
        }
        /**
         * Are subscribers being notified?
         */
        isRaised() {
            return this.value;
        }
        subscribe(handler) {
            const unsubscribe = super.subscribe(handler);
            if (this.value) {
                handler();
            }
            return unsubscribe;
        }
    }

    class DetailedError extends Error {
        constructor(props, remarks) {
            if (typeof props === 'string') {
                super(props);
                this.remarks = remarks;
            }
            else {
                super(props.message);
                this.remarks = props.remarks;
                this.object = props.object;
                this.durationMs = props.durationMs;
                this.inspect = props.inspect;
            }
        }
    }

    const SceneStack = [];
    /**
     * Get a reference to the current scene.
     */
    function useScene() {
        const scene = SceneStack.at(-1);
        if (!scene) {
            throw new Error('The scene is not available in the current context.');
        }
        return scene;
    }
    function useLogger() {
        return SceneStack.at(-1)?.logger ?? console;
    }

    const ThreadStack = [];
    /**
     * Get a reference to the current thread.
     */
    function useThread() {
        const thread = ThreadStack.at(-1);
        if (!thread) {
            throw new DetailedError('The thread is not available in the current context.', "<p><code>useThread()</code> can only be called from within generator functions.\n      It&#39;s not available during rendering.</p>\n");
        }
        return thread;
    }

    function errorToLog(error) {
        return {
            message: error.message,
            stack: error.stack,
            remarks: error.remarks,
        };
    }

    /**
     * Register a time event and get its duration in seconds.
     *
     * @remarks
     * This can be used to better specify when an animation should start
     * as well as how long this animation should take
     *
     * @example
     * ```ts
     * export default makeScene2D(function* (view) {
     *   const circle = createRef<Circle>();
     *
     *   view.add(
     *     <Circle ref={circle} width={320} height={320} fill={'lightseagreen'} />,
     *   );
     *
     *   yield* circle().scale(2, useDuration('circleGrow'));
     * });
     * ```
     *
     * @param name - The name of the event.
     *
     * @returns The duration of the event in seconds.
     */
    function useDuration(name) {
        const scene = useScene();
        const thread = useThread();
        return scene.timeEvents.register(name, thread.time());
    }

    const PlaybackStack = [];
    /**
     * Get a reference to the playback status.
     */
    function usePlayback() {
        const playback = PlaybackStack.at(-1);
        if (!playback) {
            throw new Error('The playback is not available in the current context.');
        }
        return playback;
    }

    function decorate(fn, ...decorators) {
        const target = { [fn.name]: fn };
        const descriptor = Object.getOwnPropertyDescriptor(target, fn.name);
        if (descriptor) {
            for (let i = decorators.length - 1; i >= 0; i--) {
                decorators[i](target, fn.name, descriptor);
            }
        }
    }

    function threadable(customName) {
        return function (_, propertyKey, descriptor) {
            descriptor.value.prototype.name = propertyKey;
            descriptor.value.prototype.threadable = true;
        };
    }

    decorate(waitUntil, threadable());
    /**
     * Wait until the given time event.
     *
     * @remarks
     * Time events are displayed on the timeline and can be edited to adjust the
     * delay. By default, an event happens immediately - without any delay.
     *
     * @example
     * ```ts
     * yield waitUntil('event');
     * ```
     *
     * @param event - The name of the time event.
     * @param after - An optional task to be run after the function completes.
     */
    function* waitUntil(event, after) {
        yield* waitFor(useDuration(event));
        if (after) {
            yield* after;
        }
    }
    decorate(waitFor, threadable());
    /**
     * Wait for the given amount of time.
     *
     * @example
     * ```ts
     * // current time: 0s
     * yield waitFor(2);
     * // current time: 2s
     * yield waitFor(3);
     * // current time: 5s
     * ```
     *
     * @param seconds - The relative time in seconds.
     * @param after - An optional task to be run after the function completes.
     */
    function* waitFor(seconds = 0, after) {
        const thread = useThread();
        const step = usePlayback().framesToSeconds(1);
        const targetTime = thread.time() + seconds;
        // subtracting the step is not necessary, but it keeps the thread time ahead
        // of the project time.
        while (targetTime - step > thread.fixed) {
            yield;
        }
        thread.time(targetTime);
        if (after) {
            yield* after;
        }
    }

    function run(firstArg, runner) {
        let task;
        if (typeof firstArg === 'string') {
            task = runner();
            setTaskName(task, firstArg);
        }
        else {
            task = firstArg();
            setTaskName(task, task);
        }
        return task;
    }

    function setTaskName(task, source) {
        const prototype = Object.getPrototypeOf(task);
        if (!prototype.threadable) {
            prototype.threadable = true;
            prototype.name = typeof source === 'string' ? source : getTaskName(source);
        }
    }
    function getTaskName(task) {
        return Object.getPrototypeOf(task).name ?? null;
    }

    function textLerp(fromString, toString, value) {
        const from = [...fromString];
        const to = [...toString];
        // left to right
        if (to.length >= from.length) {
            const current = Math.floor(to.length * value);
            const currentLength = Math.floor(map(from.length - 1, to.length, value));
            let text = '';
            for (let i = 0; i < to.length; i++) {
                if (i < current) {
                    text += to[i];
                }
                else if (from[i] || i <= currentLength) {
                    text += from[i] ?? to[i];
                }
            }
            return text;
        }
        // right to left
        else {
            const current = Math.round(from.length * (1 - value));
            const currentLength = Math.floor(map(from.length + 1, to.length, value));
            const text = [];
            for (let i = from.length - 1; i >= 0; i--) {
                if (i < current) {
                    text.unshift(from[i]);
                }
                else if (to[i] || i < currentLength) {
                    text.unshift(to[i] ?? from[i]);
                }
            }
            return text.join('');
        }
    }
    function deepLerp(from, to, value, suppressWarnings = false) {
        if (value === 0)
            return from;
        if (value === 1)
            return to;
        if (from == null || to == null) {
            if (!suppressWarnings) {
                useLogger().warn(`Attempting to lerp ${from} -> ${to} may result in unexpected behavior.`);
            }
            return undefined;
        }
        if (typeof from === 'number' && typeof to === 'number') {
            return map(from, to, value);
        }
        if (typeof from === 'string' && typeof to === 'string') {
            return textLerp(from, to, value);
        }
        if (typeof from === 'boolean' && typeof to === 'boolean') {
            return value < 0.5 ? from : to;
        }
        if ('lerp' in from) {
            return from.lerp(to, value);
        }
        if (from && to && typeof from === 'object' && typeof to === 'object') {
            if (Array.isArray(from) && Array.isArray(to)) {
                if (from.length === to.length) {
                    return from.map((f, i) => deepLerp(f, to[i], value));
                }
            }
            else {
                let toObject = false;
                if (!(from instanceof Map) && !(to instanceof Map)) {
                    toObject = true;
                    from = new Map(Object.entries(from));
                    to = new Map(Object.entries(to));
                }
                if (from instanceof Map && to instanceof Map) {
                    const result = new Map();
                    for (const key of new Set([...from.keys(), ...to.keys()])) {
                        const inter = deepLerp(from.get(key), to.get(key), value, true);
                        if (inter !== undefined)
                            result.set(key, inter);
                    }
                    return toObject ? Object.fromEntries(result) : result;
                }
            }
        }
        // fallback with an immediate jump to the new value
        return to;
    }
    function map(from, to, value) {
        return from + (to - from) * value;
    }

    function easeInOutCubic(value, from = 0, to = 1) {
        value =
            value < 0.5
                ? 4 * value * value * value
                : 1 - Math.pow(-2 * value + 2, 3) / 2;
        return map(from, to, value);
    }

    decorate(tween, threadable());
    function* tween(seconds, onProgress, onEnd) {
        const thread = useThread();
        const startTime = thread.time();
        const endTime = thread.time() + seconds;
        onProgress(0, 0);
        while (endTime > thread.fixed) {
            const time = thread.fixed - startTime;
            const value = time / seconds;
            if (time > 0) {
                onProgress(value, time);
            }
            yield;
        }
        thread.time(endTime);
        onProgress(1, seconds);
        onEnd?.(1, seconds);
    }

    class DependencyContext {
        static collectPromise(promise, initialValue = null) {
            const handle = {
                promise,
                value: initialValue,
                stack: new Error().stack,
            };
            const context = this.collectionStack.at(-1);
            if (context) {
                handle.owner = context.owner;
            }
            promise.then(value => {
                handle.value = value;
                context?.markDirty();
            });
            this.promises.push(handle);
            return handle;
        }
        static hasPromises() {
            return this.promises.length > 0;
        }
        static async consumePromises() {
            const promises = [...this.promises];
            await Promise.all(promises.map(handle => handle.promise));
            this.promises = this.promises.filter(v => !promises.includes(v));
            return promises;
        }
        constructor(owner) {
            this.owner = owner;
            this.dependencies = new Set();
            this.event = new FlagDispatcher();
            this.markDirty = () => this.event.raise();
            this.invokable = this.invoke.bind(this);
            Object.defineProperty(this.invokable, 'context', {
                value: this,
            });
            Object.defineProperty(this.invokable, 'toPromise', {
                value: this.toPromise.bind(this),
            });
        }
        invoke() {
            // do nothing
        }
        startCollecting() {
            if (DependencyContext.collectionSet.has(this)) {
                throw new DetailedError('A circular dependency occurred between signals.', `This can happen when signals reference each other in a loop.
        Try using the attached stack trace to locate said loop.`);
            }
            DependencyContext.collectionSet.add(this);
            DependencyContext.collectionStack.push(this);
        }
        finishCollecting() {
            DependencyContext.collectionSet.delete(this);
            if (DependencyContext.collectionStack.pop() !== this) {
                throw new Error('collectStart/collectEnd was called out of order.');
            }
        }
        clearDependencies() {
            this.dependencies.forEach(dep => dep.unsubscribe(this.markDirty));
            this.dependencies.clear();
        }
        collect() {
            const signal = DependencyContext.collectionStack.at(-1);
            if (signal) {
                signal.dependencies.add(this.event.subscribable);
                this.event.subscribe(signal.markDirty);
            }
        }
        dispose() {
            this.clearDependencies();
            this.event.clear();
            this.owner = null;
        }
        async toPromise() {
            do {
                await DependencyContext.consumePromises();
                this.invokable();
            } while (DependencyContext.hasPromises());
            return this.invokable;
        }
    }
    DependencyContext.collectionSet = new Set();
    DependencyContext.collectionStack = [];
    DependencyContext.promises = [];

    const DEFAULT = Symbol.for('@motion-canvas/core/signals/default');

    function isReactive(value) {
        return typeof value === 'function';
    }
    function unwrap(value) {
        return isReactive(value) ? value() : value;
    }

    class SignalContext extends DependencyContext {
        constructor(initial, interpolation, owner = undefined, parser = value => value, extensions = {}) {
            super(owner);
            this.initial = initial;
            this.interpolation = interpolation;
            this.parser = parser;
            this.tweening = false;
            Object.defineProperty(this.invokable, 'reset', {
                value: this.reset.bind(this),
            });
            Object.defineProperty(this.invokable, 'save', {
                value: this.save.bind(this),
            });
            Object.defineProperty(this.invokable, 'isInitial', {
                value: this.isInitial.bind(this),
            });
            if (this.initial !== undefined) {
                this.current = this.initial;
                this.markDirty();
                if (!isReactive(this.initial)) {
                    this.last = this.parse(this.initial);
                }
            }
            this.extensions = {
                getter: this.getter.bind(this),
                setter: this.setter.bind(this),
                tweener: this.tweener.bind(this),
                ...extensions,
            };
        }
        toSignal() {
            return this.invokable;
        }
        parse(value) {
            return this.parser(value);
        }
        set(value) {
            this.extensions.setter(value);
            return this.owner;
        }
        setter(value) {
            if (value === DEFAULT) {
                value = this.initial;
            }
            if (this.current === value) {
                return this.owner;
            }
            this.current = value;
            this.clearDependencies();
            if (!isReactive(value)) {
                this.last = this.parse(value);
            }
            this.markDirty();
            return this.owner;
        }
        get() {
            return this.extensions.getter();
        }
        getter() {
            if (this.event.isRaised() && isReactive(this.current)) {
                this.clearDependencies();
                this.startCollecting();
                try {
                    this.last = this.parse(this.current());
                }
                catch (e) {
                    useLogger().error({
                        ...errorToLog(e),
                        inspect: this.owner?.key,
                    });
                }
                this.finishCollecting();
            }
            this.event.reset();
            this.collect();
            return this.last;
        }
        invoke(value, duration, timingFunction = easeInOutCubic, interpolationFunction = this.interpolation) {
            if (value === undefined) {
                return this.get();
            }
            if (duration === undefined) {
                return this.set(value);
            }
            const queue = this.createQueue(timingFunction, interpolationFunction);
            return queue.to(value, duration);
        }
        createQueue(defaultTimingFunction, defaultInterpolationFunction) {
            const initial = this.get();
            const queue = [];
            const task = run('animation chain', function* animate() {
                while (queue.length > 0) {
                    yield* queue.shift();
                }
            });
            task.to = (value, duration, timingFunction = defaultTimingFunction, interpolationFunction = defaultInterpolationFunction) => {
                defaultTimingFunction = timingFunction;
                defaultInterpolationFunction = interpolationFunction;
                queue.push(this.tween(value, duration, timingFunction, interpolationFunction));
                return task;
            };
            task.back = (time, timingFunction = defaultTimingFunction, interpolationFunction = defaultInterpolationFunction) => {
                defaultTimingFunction = timingFunction;
                defaultInterpolationFunction = interpolationFunction;
                queue.push(this.tween(initial, time, defaultTimingFunction, defaultInterpolationFunction));
                return task;
            };
            task.wait = (duration) => {
                queue.push(waitFor(duration));
                return task;
            };
            task.run = (generator) => {
                queue.push(generator);
                return task;
            };
            task.do = (callback) => {
                queue.push(run(function* () {
                    callback();
                }));
                return task;
            };
            return task;
        }
        *tween(value, duration, timingFunction, interpolationFunction) {
            if (value === DEFAULT) {
                value = this.initial;
            }
            this.tweening = true;
            yield* this.extensions.tweener(value, duration, timingFunction, interpolationFunction);
            this.set(value);
            this.tweening = false;
        }
        *tweener(value, duration, timingFunction, interpolationFunction) {
            const from = this.get();
            yield* tween(duration, v => {
                this.set(interpolationFunction(from, this.parse(unwrap(value)), timingFunction(v)));
            });
        }
        dispose() {
            super.dispose();
            this.initial = undefined;
            this.current = undefined;
            this.last = undefined;
        }
        /**
         * Reset the signal to its initial value (if one has been set).
         *
         * @example
         * ```ts
         * const signal = createSignal(7);
         *
         * signal.reset();
         * // same as:
         * signal(7);
         * ```
         */
        reset() {
            if (this.initial !== undefined) {
                this.set(this.initial);
            }
            return this.owner;
        }
        /**
         * Compute the current value of the signal and immediately set it.
         *
         * @remarks
         * This method can be used to stop the signal from updating while keeping its
         * current value.
         *
         * @example
         * ```ts
         * signal.save();
         * // same as:
         * signal(signal());
         * ```
         */
        save() {
            return this.set(this.get());
        }
        /**
         * Check if the signal is currently using its initial value.
         *
         * @example
         * ```ts
         *
         * const signal = createSignal(0);
         * signal.isInitial(); // true
         *
         * signal(5);
         * signal.isInitial(); // false
         *
         * signal(DEFAULT);
         * signal.isInitial(); // true
         * ```
         */
        isInitial() {
            this.collect();
            return this.current === this.initial;
        }
        /**
         * Get the initial value of this signal.
         */
        getInitial() {
            return this.initial;
        }
        /**
         * Get the raw value of this signal.
         *
         * @remarks
         * If the signal was provided with a factory function, the function itself
         * will be returned, without invoking it.
         *
         * This method can be used to create copies of signals.
         *
         * @example
         * ```ts
         * const a = createSignal(2);
         * const b = createSignal(() => a);
         * // b() == 2
         *
         * const bClone = createSignal(b.raw());
         * // bClone() == 2
         *
         * a(4);
         * // b() == 4
         * // bClone() == 4
         * ```
         */
        raw() {
            return this.current;
        }
        /**
         * Is the signal undergoing a tween?
         */
        isTweening() {
            return this.tweening;
        }
    }

    function createSignal(initial, interpolation = deepLerp, owner) {
        return new SignalContext(initial, interpolation, owner).toSignal();
    }

    window.MotionCanvasAuthored = {
      seek(frame, totalFrames) {
        const progress = createSignal(0);
        progress(frame / Math.max(1, totalFrames - 1));
        return progress();
      },
    };

})();
