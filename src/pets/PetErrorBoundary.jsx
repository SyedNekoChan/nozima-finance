import { Component } from 'react';

/*
 * Pets are cosmetic. If anything in the pet subsystem throws while
 * rendering, the pet disappears and the financial application carries on.
 */
export default class PetErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.warn('[pets] pet disabled after an error:', error);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}
