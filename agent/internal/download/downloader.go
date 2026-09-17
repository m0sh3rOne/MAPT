package download

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type Downloader struct {
	client *http.Client
}

func NewDownloader() *Downloader {
	return &Downloader{
		client: &http.Client{
			Timeout: 30 * time.Minute,
		},
	}
}

func (d *Downloader) DownloadFile(url string, token string, destPath string, expectedSHA256 string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}

	resp, err := d.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad HTTP status while downloading file: %s", resp.Status)
	}

	dir := filepath.Dir(destPath)
	if dir != "" && dir != "." {
		_ = os.MkdirAll(dir, 0755)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	hasher := sha256.New()
	writer := io.MultiWriter(out, hasher)

	if _, err := io.Copy(writer, resp.Body); err != nil {
		return err
	}

	calculatedHash := hex.EncodeToString(hasher.Sum(nil))
	if expectedSHA256 != "" && !strings.EqualFold(calculatedHash, expectedSHA256) {
		_ = os.Remove(destPath)
		return fmt.Errorf("checksum mismatch: expected %s, got %s", expectedSHA256, calculatedHash)
	}

	return nil
}

func VerifySHA256(filePath string, expectedSHA256 string) (bool, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return false, err
	}
	defer f.Close()

	hasher := sha256.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return false, err
	}
	actual := hex.EncodeToString(hasher.Sum(nil))
	return strings.EqualFold(actual, expectedSHA256), nil
}
