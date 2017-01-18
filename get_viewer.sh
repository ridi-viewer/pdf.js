gulp clean &&
(if [[ $1 == "-v" ]]
then
  gulp lintviewer
else
  gulp lint
fi) &&
(if [[ $1 == "-v" ]]
then
  gulp genericviewer
else
  gulp generic
fi) &&
rsync -avh --delete build/generic/* ../res/pdf-viewer/ &&
rsync -avh --delete ridi_modules ../res/pdf-viewer/ &&
cd ../res &&
./generate-qrc.sh &&
(if [[ $1 != "-v" ]]
then
  echo "NOTE : To build only viewer, give -v option to this script."
fi) &&
echo "NOTE : Qt RCC may not notice the changes sometimes."
