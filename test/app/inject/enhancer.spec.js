import 'babel-polyfill';
import expect from 'expect';
import { createStore, compose } from 'redux';
import { listenMessage } from '../../utils/inject';
import '../../../src/browser/extension/inject/pageScript';

function counter(state = 0, action) {
  switch (action.type) {
    case 'INCREMENT': return state + 1;
    case 'DECREMENT': return state - 1;
    default: return state;
  }
}

describe('Redux enhancer', () => {
  it('should create the store', async () => {
    const message = await listenMessage(() => {
      window.store = createStore(counter, window.devToolsExtension());
      expect(window.store).toBeA('object');
    });
    expect(message.type).toBe('INIT_INSTANCE');
    expect(window.store.getState()).toBe(0);
  });

  it('should start monitoring', async () => {
    let message = await listenMessage(() => {
      window.postMessage({ type: 'START', source: '@devtools-extension' }, '*');
    });
    expect(message.type).toBe('START');

    message = await listenMessage();
    expect(message.type).toBe('STATE');
    expect(message.payload.actionsById[0].action.type).toBe('@@INIT');
    expect(message.payload.computedStates[0].state).toBe(0);
  });

  it('should perform actions', async () => {
    let message = await listenMessage(() => {
      window.store.dispatch({ type: 'INCREMENT' });
      expect(window.store.getState()).toBe(1);
    });
    expect(message.type).toBe('ACTION');
    expect(message.action.action.type).toBe('INCREMENT');
    expect(message.payload).toBe(1);

    message = await listenMessage(() => {
      window.store.dispatch({ type: 'INCREMENT' });
      expect(window.store.getState()).toBe(2);
    });
    expect(message.type).toBe('STATE');
    const count = message.payload.computedStates.length - 1;
    expect(message.payload.actionsById[count].action.type).toBe('INCREMENT');
    expect(message.payload.computedStates[count].state).toBe(2);
  });

  it('should dispatch actions remotely', async () => {
    let message = await listenMessage(() => {
      window.postMessage({
        type: 'ACTION',
        payload: { type: 'INCREMENT' },
        source: '@devtools-extension'
      }, '*');
    });
    expect(message.type).toBe('ACTION');

    message = await listenMessage();
    expect(message.type).toBe('ACTION');
    expect(message.action.action.type).toBe('INCREMENT');
    expect(message.payload).toBe(3);
  });

  it('should cancel (toggle) action', async () => {
    let message = await listenMessage(() => {
      window.postMessage({
        type: 'DISPATCH',
        payload: {type: 'TOGGLE_ACTION', id: 1},
        source: '@devtools-extension'
      }, '*');
    });
    expect(message.type).toBe('DISPATCH');

    message = await listenMessage();
    expect(message.type).toBe('STATE');
    expect(message.payload.computedStates[message.payload.computedStates.length - 1].state).toBe(2);
    expect(window.store.getState()).toBe(2);

    message = await listenMessage(() => {
      window.postMessage({
        type: 'DISPATCH',
        payload: {type: 'TOGGLE_ACTION', id: 1},
        source: '@devtools-extension'
      }, '*');
    });
    expect(message.type).toBe('DISPATCH');

    message = await listenMessage();
    expect(message.type).toBe('STATE');
    expect(window.store.getState()).toBe(3);
  });

  it('should move back and forward (time travel)', async () => {
    let message = await listenMessage(() => {
      window.postMessage({
        type: 'DISPATCH',
        payload: {type: 'JUMP_TO_STATE', index: 2},
        source: '@devtools-extension'
      }, '*');
    });
    expect(message.type).toBe('DISPATCH');
    expect(window.store.getState()).toBe(2);

    message = await listenMessage(() => {
      window.postMessage({
        type: 'DISPATCH',
        payload: {type: 'JUMP_TO_STATE', index: 3},
        source: '@devtools-extension'
      }, '*');
    });
    expect(message.type).toBe('DISPATCH');
    expect(window.store.getState()).toBe(3);
  });

  it('should import state history', async () => {
    let message = await listenMessage(() => {
      window.postMessage({
        type: 'IMPORT',
        state: JSON.stringify({
          monitorState: {},
          actionsById: {
            '0': { type: 'PERFORM_ACTION', action: { type: '@@INIT' } },
            '1': { type: 'PERFORM_ACTION', action: { type: 'INCREMENT' } },
            '2': { type: 'PERFORM_ACTION', action: { type: 'INCREMENT' } }
          },
          nextActionId: 3,
          stagedActionIds: [ 0, 1, 2 ],
          skippedActionIds: [],
          currentStateIndex: 2,
          computedStates: [ { state: 0 }, { state: 1 }, { state: 2 } ]
        }),
        source: '@devtools-extension'
      }, '*');
    });
    expect(message.type).toBe('IMPORT');
    message = await listenMessage();
    expect(message.type).toBe('STATE');
    expect(window.store.getState()).toBe(2);
  });

  it('should create the store with config parameters', async () => {
    const name = 'Some title';
    const message = await listenMessage(() => {
      window.store = createStore(counter, window.devToolsExtension({
        name,
        actionsBlacklist: ['SOME_ACTION'],
        statesFilter: state => state,
        serializeState: (key, value) => value
      }));
      expect(window.store).toBeA('object');
    });
    expect(message.type).toBe('INIT_INSTANCE');
    expect(message.name).toBe(name);
  });

  it('should create the store using old Redux api', async () => {
    const message = await listenMessage(() => {
      window.store = window.devToolsExtension()(createStore)(counter);
      expect(window.store).toBeA('object');
    });
    expect(message.type).toBe('INIT_INSTANCE');
  });

  it('should create the store with several enhancers', async () => {
    const testEnhancer = next =>
      (reducer, initialState, enhancer) => next(reducer, initialState, enhancer);
    const message = await listenMessage(() => {
      window.store = createStore(counter, compose(
        testEnhancer,
        window.devToolsExtension())
      );
      expect(window.store).toBeA('object');
    });
    expect(message.type).toBe('INIT_INSTANCE');
  });
});
