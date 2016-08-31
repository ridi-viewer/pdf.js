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
(if [[ $1 == "-f" ]]
then
  echo "NOTE : All files including build script are gone through lint."
else
  echo "NOTE : To build and lint all PDF.js module then give -f option to this script."
fi) &&
echo "NOTE : Qt RCC may not notice the changes sometimes."
