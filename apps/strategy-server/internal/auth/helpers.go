package auth

import (
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"os"
)

// hashToken produces a SHA-256 hex digest of a token for cache storage.
// We never store raw tokens in the database.
func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// zitadelKeyFile represents the JSON key file exported from Zitadel.
type zitadelKeyFile struct {
	Type   string `json:"type"`
	KeyID  string `json:"keyId"`
	Key    string `json:"key"`
	UserID string `json:"userId"`
}

// loadRSAKey reads an RSA private key from a PEM file or Zitadel JSON key file.
func loadRSAKey(path string) (*rsa.PrivateKey, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read key file %s: %w", path, err)
	}

	// Try Zitadel JSON key format first.
	var keyFile zitadelKeyFile
	if err := json.Unmarshal(data, &keyFile); err == nil && keyFile.Key != "" {
		data = []byte(keyFile.Key)
	}

	// Parse PEM block.
	block, _ := pem.Decode(data)
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in %s", path)
	}

	// Try PKCS8 first (Zitadel default), then PKCS1.
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		rsaKey, err2 := x509.ParsePKCS1PrivateKey(block.Bytes)
		if err2 != nil {
			return nil, fmt.Errorf("parse private key: pkcs8=%v, pkcs1=%v", err, err2)
		}
		return rsaKey, nil
	}

	rsaKey, ok := key.(*rsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("key is not RSA: %T", key)
	}
	return rsaKey, nil
}
