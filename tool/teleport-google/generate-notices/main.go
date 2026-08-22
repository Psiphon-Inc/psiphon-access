package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
)

type Module struct {
	Path    string  `json:"Path"`
	Version string  `json:"Version"`
	Main    bool    `json:"Main"`
	Dir     string  `json:"Dir"`
	Replace *Module `json:"Replace"`
}

type Package struct {
	ImportPath string  `json:"ImportPath"`
	Module     *Module `json:"Module"`
}

// ModuleNotice holds discovered licence and notice files for a single module.
type ModuleNotice struct {
	Path         string
	Version      string
	Dir          string
	LicenceFiles map[string]string // filename -> content
	NoticeFiles  map[string]string // filename -> content
	IsMPL        bool
	IsUnlicense  bool
}

type Target struct {
	PkgPath string
	OutPath string
}

var defaultTargets = []Target{
	{PkgPath: "./tool/teleport/", OutPath: "THIRD_PARTY_NOTICES"},
	{PkgPath: "./integrations/operator/", OutPath: "THIRD_PARTY_NOTICES_OPERATOR"},
}

func main() {
	outPath := flag.String("o", "", "Output path for generated notices file")
	checkMode := flag.Bool("check", false, "Check if existing notices file is up to date")
	pkgPath := flag.String("pkg", "", "Go package path to inspect dependencies for")
	flag.Parse()

	var targets []Target
	if *pkgPath == "" && *outPath == "" {
		targets = defaultTargets
	} else {
		pkg := *pkgPath
		if pkg == "" {
			pkg = "./tool/teleport/"
		}
		out := *outPath
		if out == "" {
			if strings.Contains(pkg, "operator") {
				out = "THIRD_PARTY_NOTICES_OPERATOR"
			} else {
				out = "THIRD_PARTY_NOTICES"
			}
		}
		targets = []Target{{PkgPath: pkg, OutPath: out}}
	}

	for _, target := range targets {
		content, err := GenerateNotices(target.PkgPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error generating notices for %s: %v\n", target.PkgPath, err)
			os.Exit(1)
		}

		if *checkMode {
			existing, err := os.ReadFile(target.OutPath)
			if err != nil {
				fmt.Fprintf(os.Stderr, "Error reading %s for drift check: %v\n", target.OutPath, err)
				os.Exit(1)
			}
			if !bytes.Equal(existing, content) {
				fmt.Fprintf(os.Stderr, "ERROR: %s is out of date. Run 'go run ./tool/teleport-google/generate-notices' to update.\n", target.OutPath)
				os.Exit(1)
			}
			fmt.Printf("SUCCESS: %s is up to date.\n", target.OutPath)
		} else {
			if err := os.WriteFile(target.OutPath, content, 0644); err != nil {
				fmt.Fprintf(os.Stderr, "Error writing %s: %v\n", target.OutPath, err)
				os.Exit(1)
			}
			fmt.Printf("Successfully wrote %s (%d bytes)\n", target.OutPath, len(content))
		}
	}
}

// GetDepsModules returns all unique modules linked into the given package.
func GetDepsModules(pkgPath string) (map[string]*Module, error) {
	cmd := exec.Command("go", "list", "-deps", "-json", pkgPath)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("stdout pipe failed: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("go list start failed: %w", err)
	}

	decoder := json.NewDecoder(stdout)
	modulesMap := make(map[string]*Module)

	for {
		var pkg Package
		if err := decoder.Decode(&pkg); err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("json decode failed: %w", err)
		}
		if pkg.Module != nil {
			m := pkg.Module
			modPath := m.Path
			modulesMap[modPath] = m
		}
	}

	if err := cmd.Wait(); err != nil {
		return nil, fmt.Errorf("go list wait failed: %w", err)
	}
	return modulesMap, nil
}

func CollectModuleNotices(m *Module) (*ModuleNotice, error) {
	dir := m.Dir
	if m.Replace != nil && m.Replace.Dir != "" {
		dir = m.Replace.Dir
	}

	mn := &ModuleNotice{
		Path:         m.Path,
		Version:      m.Version,
		Dir:          dir,
		LicenceFiles: make(map[string]string),
		NoticeFiles:  make(map[string]string),
	}

	if dir == "" {
		return nil, fmt.Errorf("module %s has empty Dir", m.Path)
	}

	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("failed to read dir %s for module %s: %w", dir, m.Path, err)
	}

	licenseCandidates := []string{
		"LICENSE", "LICENSE.txt", "LICENSE.md", "LICENCE", "LICENCE.txt", "LICENCE.md",
		"COPYING", "COPYING.txt", "COPYING.md", "LICENSE-2.0.txt", "LICENSE.code",
		"LICENSE.libyaml", "LICENSE-MIT", "LICENSE-APACHE", "LICENSE.MIT", "LICENSE.APACHE",
		"LICENSE-THIRD-PARTY", "LICENSE-GO", "UNLICENSE",
	}

	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		name := entry.Name()
		upper := strings.ToUpper(name)

		isLicense := false
		for _, cand := range licenseCandidates {
			if upper == strings.ToUpper(cand) {
				isLicense = true
				break
			}
		}
		if !isLicense {
			if strings.HasPrefix(upper, "LICENSE") || strings.HasPrefix(upper, "LICENCE") || strings.HasPrefix(upper, "COPYING") || strings.HasPrefix(upper, "UNLICENSE") {
				if !strings.HasSuffix(upper, ".GO") && !strings.HasSuffix(upper, ".PY") && !strings.HasSuffix(upper, ".SH") && !strings.HasSuffix(upper, ".YML") && !strings.HasSuffix(upper, ".YAML") && !strings.HasSuffix(upper, ".JSON") {
					isLicense = true
				}
			}
		}

		if isLicense {
			body, err := os.ReadFile(filepath.Join(dir, name))
			if err == nil {
				mn.LicenceFiles[name] = string(body)
				if bytes.Contains(body, []byte("Mozilla Public License")) {
					mn.IsMPL = true
				}
				if bytes.Contains(body, []byte("https://unlicense.org")) || bytes.Contains(body, []byte("This is free and unencumbered software released into the public domain")) {
					mn.IsUnlicense = true
				}
			}
		}

		isNotice := strings.HasPrefix(upper, "NOTICE") || strings.Contains(upper, "NOTICE")
		if isNotice {
			if !strings.HasSuffix(upper, ".GO") && !strings.HasSuffix(upper, ".PY") && !strings.HasSuffix(upper, ".SH") && !strings.HasSuffix(upper, ".YML") && !strings.HasSuffix(upper, ".YAML") && !strings.HasSuffix(upper, ".JSON") {
				// Avoid matching LICENSE-THIRD-PARTY if it was already treated as license
				if !isLicense {
					body, err := os.ReadFile(filepath.Join(dir, name))
					if err == nil {
						mn.NoticeFiles[name] = string(body)
					}
				}
			}
		}
	}

	return mn, nil
}

func GenerateNotices(pkgPath string) ([]byte, error) {
	modulesMap, err := GetDepsModules(pkgPath)
	if err != nil {
		return nil, err
	}

	var modulePaths []string
	for p, m := range modulesMap {
		if !m.Main {
			modulePaths = append(modulePaths, p)
		}
	}
	sort.Strings(modulePaths)

	var buf bytes.Buffer
	buf.WriteString("THIRD-PARTY SOFTWARE NOTICES AND INFORMATION\n")
	buf.WriteString("===========================================\n\n")
	buf.WriteString("Psiphon Access includes software licensed under third-party open source licenses.\n")
	buf.WriteString("The third-party software components and their licenses are listed below.\n\n")

	var mplNotices []*ModuleNotice
	var allNotices []*ModuleNotice
	var missingLicenses []string

	for _, p := range modulePaths {
		m := modulesMap[p]
		mn, err := CollectModuleNotices(m)
		if err != nil {
			return nil, err
		}
		if len(mn.LicenceFiles) == 0 {
			missingLicenses = append(missingLicenses, p)
		}
		if mn.IsMPL {
			mplNotices = append(mplNotices, mn)
		}
		allNotices = append(allNotices, mn)
	}

	if len(missingLicenses) > 0 {
		return nil, fmt.Errorf("modules with no licence file found: %v", missingLicenses)
	}

	if len(mplNotices) > 0 {
		buf.WriteString("MOZILLA PUBLIC LICENSE (MPL-2.0) SOURCE CODE AVAILABILITY\n")
		buf.WriteString("---------------------------------------------------------\n")
		buf.WriteString("The following components are licensed under the Mozilla Public License v2.0 (MPL-2.0).\n")
		buf.WriteString("In accordance with MPL-2.0 Section 3.2, source code for these components is available\n")
		buf.WriteString("at the respective URLs below:\n\n")

		for _, mn := range mplNotices {
			url := getSourceURL(mn.Path)
			buf.WriteString(fmt.Sprintf("- Module: %s (%s)\n  Source: %s\n", mn.Path, mn.Version, url))
		}
		buf.WriteString("\n===========================================\n\n")
	}

	for _, mn := range allNotices {
		buf.WriteString(fmt.Sprintf("Component: %s\n", mn.Path))
		if mn.Version != "" {
			buf.WriteString(fmt.Sprintf("Version: %s\n", mn.Version))
		}
		buf.WriteString("-------------------------------------------\n")

		if mn.IsMPL {
			url := getSourceURL(mn.Path)
			buf.WriteString(fmt.Sprintf("MPL-2.0 Source Availability: %s\n\n", url))
		}

		var lNames []string
		for k := range mn.LicenceFiles {
			lNames = append(lNames, k)
		}
		sort.Strings(lNames)

		for _, name := range lNames {
			buf.WriteString(fmt.Sprintf("Licence File (%s):\n\n", name))
			buf.WriteString(strings.TrimSpace(mn.LicenceFiles[name]))
			buf.WriteString("\n\n")
		}

		var nNames []string
		for k := range mn.NoticeFiles {
			nNames = append(nNames, k)
		}
		sort.Strings(nNames)

		for _, name := range nNames {
			buf.WriteString(fmt.Sprintf("Notice File (%s):\n\n", name))
			buf.WriteString(strings.TrimSpace(mn.NoticeFiles[name]))
			buf.WriteString("\n\n")
		}

		buf.WriteString("===========================================\n\n")
	}

	return buf.Bytes(), nil
}

func getSourceURL(modulePath string) string {
	if strings.HasPrefix(modulePath, "github.com/") {
		parts := strings.Split(modulePath, "/")
		if len(parts) >= 3 {
			return fmt.Sprintf("https://%s/%s/%s", parts[0], parts[1], parts[2])
		}
	}
	if strings.HasPrefix(modulePath, "golang.org/x/") {
		return fmt.Sprintf("https://github.com/golang/%s", strings.TrimPrefix(modulePath, "golang.org/x/"))
	}
	return fmt.Sprintf("https://%s", modulePath)
}
