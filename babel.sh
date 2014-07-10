#!/bin/sh
#run on terminal in projects root folder:
case $1 in
   compile|c)
            pybabel -v compile -d ./sagenb/translations/ -l de_AT
            ;;
   extract|update|*)
            pybabel -v extract --no-wrap --sort-by-file -F ./babel.cfg -o ./message.pot ./
            sleep 1s
            pybabel -v update -i ./message.pot -d ./sagenb/translations/ -l de_AT
            ;;
esac