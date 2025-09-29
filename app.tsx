import React from 'react';
import { Provider } from 'react-redux';
import RootNavigator from './NAVIGATION/rootNavigator';
import { store } from './store';

export default function App() {
  return (
    <Provider store={store}>
      <RootNavigator />
    </Provider>
  );
}