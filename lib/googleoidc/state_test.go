/*
 * Psiphon Access
 * Copyright (C) 2026  Psiphon Inc.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

package googleoidc

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gravitational/trace"
	"github.com/jonboulle/clockwork"
	"github.com/stretchr/testify/require"

	"github.com/gravitational/teleport/lib/backend/memory"
)

func newTestStateStore(t *testing.T) *StateStore {
	t.Helper()

	bk, err := memory.New(memory.Config{})
	require.NoError(t, err)
	t.Cleanup(func() { require.NoError(t, bk.Close()) })

	store, err := NewStateStore(bk, clockwork.NewFakeClock(), 10*time.Minute)
	require.NoError(t, err)
	return store
}

// A callback may be replayed. The second claim of the same state token must be
// denied, so that a stolen callback URL cannot be used twice.
func TestStateIsSingleUse(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	store := newTestStateStore(t)

	require.NoError(t, store.Claim(ctx, "state-token"))

	err := store.Claim(ctx, "state-token")
	require.Error(t, err)
	require.True(t, errors.Is(err, ErrStateAlreadyUsed), "got %v", err)
	require.True(t, trace.IsAccessDenied(err), "the replay must be an access denied error, got %v", err)

	// A different state token is unaffected.
	require.NoError(t, store.Claim(ctx, "other-state-token"))

	require.Error(t, store.Claim(ctx, ""))
}

// Two callbacks that arrive at the same time must not both win.
func TestStateClaimIsAtomic(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	store := newTestStateStore(t)

	const racers = 16
	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		succeeded int
	)
	start := make(chan struct{})

	for range racers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if err := store.Claim(ctx, "shared-state"); err == nil {
				mu.Lock()
				succeeded++
				mu.Unlock()
			}
		}()
	}

	close(start)
	wg.Wait()

	require.Equal(t, 1, succeeded, "exactly one callback may claim a state token")
}

// The nonce is stored beside the state, never in a URL the browser sees.
func TestNonceRoundTrip(t *testing.T) {
	t.Parallel()
	ctx := context.Background()

	store := newTestStateStore(t)

	require.NoError(t, store.PutNonce(ctx, "state-token", "the-nonce"))

	nonce, err := store.Nonce(ctx, "state-token")
	require.NoError(t, err)
	require.Equal(t, "the-nonce", nonce)

	_, err = store.Nonce(ctx, "unknown-state")
	require.True(t, trace.IsNotFound(err), "got %v", err)

	require.Error(t, store.PutNonce(ctx, "state-token", ""))
}

// The state token is a bearer value, so the backend key must hold only a
// digest of it.
func TestStateKeyHidesTheToken(t *testing.T) {
	t.Parallel()

	key := stateKey("used", "super-secret-state").String()
	require.NotContains(t, key, "super-secret-state")
	require.True(t, strings.Contains(key, forkKeyspace), "got %q", key)
}
