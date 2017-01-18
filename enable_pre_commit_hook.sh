echo "Press any key to install pre-commit hook for this repository, otherwise press Ctrl+C."
read
pre_commit_file_path=`git rev-parse --git-dir`/hooks/pre-commit
echo >> $pre_commit_file_path
cat get_viewer.sh >> $pre_commit_file_path
echo "Added get_viewer.sh to "$pre_commit_file_path
chmod 755 $pre_commit_file_path
echo "chmod 755 "$pre_commit_file_path" done!"
