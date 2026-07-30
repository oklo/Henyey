PREFIX ?= $(HOME)/.local

.SUFFIXES:

.PHONY: all check check-henyey run-henyey install clean

all:
	@mkdir -p build
	@$(CC) -std=c99 -O2 -Wall -Wextra -Iruntime -c runtime/f4runtime.c -o build/f4runtime.o
	@printf '%s\n' "Built IBFTC bootstrap and 7094 runtime."

check: all check-henyey
	@python3 -m unittest discover -s tests -v

build/henyey-7094: henyey.f src/ibftc.py runtime/f4runtime.c runtime/f4runtime.h
	@mkdir -p build
	@bin/ibftc -o $@ henyey.f

build/henyey-7094.out: build/henyey-7094 henyey.in
	@build/henyey-7094 < henyey.in > $@

run-henyey: build/henyey-7094.out
	@printf '%s\n' "7094-compatible printout: build/henyey-7094.out"

check-henyey: build/henyey-7094.out henyey.out scripts/compare_henyey_tracks.py
	@python3 scripts/compare_henyey_tracks.py henyey.out build/henyey-7094.out

install: all
	@mkdir -p "$(PREFIX)/bin" "$(PREFIX)/lib/ibftc/runtime" "$(PREFIX)/lib/ibftc/src"
	@cp bin/ibftc bin/ibsys "$(PREFIX)/bin/"
	@cp src/ibftc.py src/ibsys.py "$(PREFIX)/lib/ibftc/src/"
	@cp runtime/f4runtime.c runtime/f4runtime.h "$(PREFIX)/lib/ibftc/runtime/"
	@printf '%s\n' "Installed commands in $(PREFIX)/bin"

clean:
	@rm -rf build
