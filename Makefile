PREFIX ?= $(HOME)/.local

.PHONY: all check install clean

all:
	@mkdir -p build
	@$(CC) -std=c99 -O2 -Wall -Wextra -Iruntime -c runtime/f4runtime.c -o build/f4runtime.o
	@printf '%s\n' "Built IBFTC bootstrap and 7094 runtime."

check: all
	@python3 -m unittest discover -s tests -v

install: all
	@mkdir -p "$(PREFIX)/bin" "$(PREFIX)/lib/ibftc/runtime" "$(PREFIX)/lib/ibftc/src"
	@cp bin/ibftc bin/ibsys "$(PREFIX)/bin/"
	@cp src/ibftc.py src/ibsys.py "$(PREFIX)/lib/ibftc/src/"
	@cp runtime/f4runtime.c runtime/f4runtime.h "$(PREFIX)/lib/ibftc/runtime/"
	@printf '%s\n' "Installed commands in $(PREFIX)/bin"

clean:
	@rm -rf build
