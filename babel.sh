#!/bin/sh
#run on terminal in projects root folder to change german translation:
case $1 in
   compile)
            pybabel -v compile -d ./sagenb/translations/ -l de_AT
            ;;
   extract|update)
            pybabel -v extract --no-wrap --sort-by-file -F ./babel.cfg -o ./message.pot ./
            sleep 1s
            pybabel -v update -i ./message.pot -d ./sagenb/translations/ -l de_AT
            ;;
	*)
			echo "Must be called with one argument. Options: extract|update or compile";
esac