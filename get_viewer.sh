gulp clean &&
(if [[ $1 == "-f" ]]
then
  gulp generic
else
  gulp genericviewer
fi) &&
(if [[ $1 == "-f" ]]
then
  gulp lint
else
  gulp lintviewer
fi) &&
rsync -avh --delete build/generic/* ../res/pdf-viewer/ &&
rsync -avh --delete ridi_modules ../res/pdf-viewer/ &&
cd ../res &&
./generate-qrc.sh &&
echo "NOTE : To build all PDF.js module then give -f option to this script." &&
echo "NOTE : Qt RCC may not notice the changes sometimes."
