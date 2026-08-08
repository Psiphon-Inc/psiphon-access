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
	"crypto/sha256"
	"encoding/hex"
	"time"

	"github.com/gravitational/trace"
	"github.com/jonboulle/clockwork"

	"github.com/gravitational/teleport/lib/backend"
)

// forkKeyspace is the backend keyspace this fork owns. Nothing upstream reads
// or writes it, so single-use state needs no patch to lib/services.
const forkKeyspace = "fork_google_oidc"

// ErrStateAlreadyUsed reports a replayed OIDC callback.
//
// It stays inside the Auth Service. The callback records it as the audit
// failure class [failureCallbackReplayed] and hands the caller the neutral
// [errStateNotUsable] instead, so a caller cannot tell a replayed state from a
// state that names no login.
var ErrStateAlreadyUsed = &trace.AccessDeniedError{Message: "OIDC callback state was already used"}

// StateStore makes an OIDC state token single-use.
//
// The first callback that presents a state token writes a marker in the fork
// keyspace. A second callback with the same token finds the marker and is
// denied. Create is atomic in every Teleport backend, so two concurrent
// callbacks cannot both win.
type StateStore struct {
	backend backend.Backend
	clock   clockwork.Clock
	ttl     time.Duration
}

// NewStateStore returns a state store on the given backend.
func NewStateStore(bk backend.Backend, clock clockwork.Clock, ttl time.Duration) (*StateStore, error) {
	if bk == nil {
		return nil, trace.BadParameter("missing backend")
	}
	if clock == nil {
		clock = clockwork.NewRealClock()
	}
	if ttl <= 0 {
		return nil, trace.BadParameter("state marker TTL must be positive")
	}
	return &StateStore{backend: bk, clock: clock, ttl: ttl}, nil
}

// stateKey returns the backend key for a state token. The token is a bearer
// value, so only its digest is stored.
func stateKey(kind, stateToken string) backend.Key {
	digest := sha256.Sum256([]byte(stateToken))
	return backend.NewKey(forkKeyspace, kind, hex.EncodeToString(digest[:]))
}

// PutNonce stores the nonce that belongs to a state token.
//
// The nonce is an independent random value, and it never travels in the URL
// the browser sees, so it cannot be read from browser history, from a Referer
// header, or from a proxy log.
func (s *StateStore) PutNonce(ctx context.Context, stateToken, nonce string) error {
	if stateToken == "" || nonce == "" {
		return trace.BadParameter("missing OIDC state token or nonce")
	}

	_, err := s.backend.Create(ctx, backend.Item{
		Key:     stateKey("nonce", stateToken),
		Value:   []byte(nonce),
		Expires: s.clock.Now().UTC().Add(s.ttl),
	})

	return trace.Wrap(err)
}

// Nonce returns the nonce that belongs to a state token.
func (s *StateStore) Nonce(ctx context.Context, stateToken string) (string, error) {
	if stateToken == "" {
		return "", trace.BadParameter("missing OIDC state token")
	}

	item, err := s.backend.Get(ctx, stateKey("nonce", stateToken))
	if err != nil {
		return "", trace.Wrap(err)
	}
	if len(item.Value) == 0 {
		return "", trace.NotFound("OIDC nonce is not stored for this state token")
	}

	return string(item.Value), nil
}

// Claim marks the state token as used. It returns [ErrStateAlreadyUsed] when
// the token was claimed before.
func (s *StateStore) Claim(ctx context.Context, stateToken string) error {
	if stateToken == "" {
		return trace.BadParameter("missing OIDC state token")
	}

	_, err := s.backend.Create(ctx, backend.Item{
		Key:     stateKey("used", stateToken),
		Value:   []byte("used"),
		Expires: s.clock.Now().UTC().Add(s.ttl),
	})
	if trace.IsAlreadyExists(err) {
		return ErrStateAlreadyUsed
	}

	return trace.Wrap(err)
}
