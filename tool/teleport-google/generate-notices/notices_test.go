package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type noticeTargetSpec struct {
	name             string
	pkgRelPath       []string
	noticesFilename  string
	expectedModCount int
	expectedNotice   int
}

var testTargets = []noticeTargetSpec{
	{
		name:             "main",
		pkgRelPath:       []string{"tool", "teleport"},
		noticesFilename:  "THIRD_PARTY_NOTICES",
		expectedModCount: 414,
		expectedNotice:   25,
	},
	{
		name:             "operator",
		pkgRelPath:       []string{"integrations", "operator"},
		noticesFilename:  "THIRD_PARTY_NOTICES_OPERATOR",
		expectedModCount: 209,
		expectedNotice:   20,
	},
}

func TestNoticesUpToDate(t *testing.T) {
	root := filepath.Join("..", "..", "..")

	for _, spec := range testTargets {
		t.Run(spec.name, func(t *testing.T) {
			pkgPath := filepath.Join(append([]string{root}, spec.pkgRelPath...)...)
			noticesPath := filepath.Join(root, spec.noticesFilename)

			generated, err := GenerateNotices(pkgPath)
			if err != nil {
				t.Fatalf("GenerateNotices failed for %s: %v", spec.name, err)
			}

			existing, err := os.ReadFile(noticesPath)
			if err != nil {
				t.Fatalf("Failed to read %s: %v", noticesPath, err)
			}

			if !bytes.Equal(existing, generated) {
				t.Fatalf("%s is out of date. Run 'go run ./tool/teleport-google/generate-notices' to update.", noticesPath)
			}
		})
	}
}

func TestNoticesContent(t *testing.T) {
	root := filepath.Join("..", "..", "..")

	for _, spec := range testTargets {
		t.Run(spec.name, func(t *testing.T) {
			pkgPath := filepath.Join(append([]string{root}, spec.pkgRelPath...)...)

			modulesMap, err := GetDepsModules(pkgPath)
			if err != nil {
				t.Fatalf("GetDepsModules failed for %s: %v", spec.name, err)
			}

			if len(modulesMap) != spec.expectedModCount {
				t.Errorf("%s: Expected %d modules linked, got %d", spec.name, spec.expectedModCount, len(modulesMap))
			}

			var mainModule *Module
			noticeCount := 0
			noLicenseCount := 0

			for _, m := range modulesMap {
				if m.Main {
					mainModule = m
					continue
				}
				mn, err := CollectModuleNotices(m)
				if err != nil {
					t.Fatalf("%s: CollectModuleNotices failed for %s: %v", spec.name, m.Path, err)
				}

				if len(mn.LicenceFiles) == 0 {
					noLicenseCount++
					t.Errorf("%s: No licence file found for module %s in %s", spec.name, m.Path, mn.Dir)
				}

				if len(mn.NoticeFiles) > 0 {
					noticeCount++
				}
			}

			if mainModule == nil {
				t.Errorf("%s: Main module not found in dependencies map", spec.name)
			}

			if noLicenseCount != 0 {
				t.Errorf("%s: Expected 0 modules with missing licence files, got %d", spec.name, noLicenseCount)
			}

			if noticeCount != spec.expectedNotice {
				t.Errorf("%s: Expected %d modules shipping a NOTICE file, got %d", spec.name, spec.expectedNotice, noticeCount)
			}

			// Verify generated content includes MPL source availability statement
			content, err := GenerateNotices(pkgPath)
			if err != nil {
				t.Fatalf("%s: GenerateNotices failed: %v", spec.name, err)
			}

			if !strings.Contains(string(content), "MOZILLA PUBLIC LICENSE (MPL-2.0) SOURCE CODE AVAILABILITY") {
				t.Errorf("%s: Generated notices missing MPL-2.0 source availability section", spec.name)
			}
		})
	}
}